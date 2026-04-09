use clap::{Parser, Subcommand};
use forge_run::config::{ProblemStatementConfigSerde, RunConfig};
use forge_run::run_single::RunSingle;

#[derive(Parser)]
#[command(name = "forge", version = "0.1.0", about = "Forge — SWE-agent in Rust")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the agent on a single problem instance
    Run(RunArgs),
    /// Display trajectory statistics
    QuickStats(QuickStatsArgs),
}

#[derive(clap::Args)]
struct RunArgs {
    /// Path to YAML config file
    #[arg(long)]
    config: Option<std::path::PathBuf>,

    /// GitHub issue URL
    #[arg(long)]
    github_url: Option<String>,

    /// Problem statement text
    #[arg(long)]
    problem_text: Option<String>,

    /// Problem statement file path
    #[arg(long)]
    problem_file: Option<std::path::PathBuf>,

    /// Model name
    #[arg(long, env = "FORGE_MODEL")]
    model: Option<String>,

    /// Model base URL (OpenAI-compatible)
    #[arg(long, env = "FORGE_BASE_URL")]
    base_url: Option<String>,

    /// API key
    #[arg(long, env = "FORGE_API_KEY")]
    api_key: Option<String>,

    /// Docker image
    #[arg(long, default_value = "sweagent/swe-agent:latest")]
    image: String,

    /// Output directory
    #[arg(long, default_value = "trajectories")]
    output_dir: String,

    /// Max steps
    #[arg(long, default_value_t = 100)]
    max_steps: u32,
}

#[derive(clap::Args)]
struct QuickStatsArgs {
    /// Directory to scan for trajectory files
    #[arg(default_value = "trajectories")]
    directory: std::path::PathBuf,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(
                    "forge=info"
                        .parse()
                        .expect("'forge=info' is a valid tracing directive"),
                ),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Run(args) => run_command(args).await,
        Commands::QuickStats(args) => quick_stats_command(args).await,
    }
}

async fn run_command(args: RunArgs) {
    // Load base config from file if given
    let mut config = if let Some(ref cfg_path) = args.config {
        match RunConfig::from_yaml_file(cfg_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Error loading config: {e}");
                std::process::exit(1);
            }
        }
    } else {
        RunConfig::default()
    };

    // CLI args override config file
    if let Some(model) = args.model {
        config.agent.model_name = Some(model);
    }
    if let Some(url) = args.base_url {
        config.agent.base_url = Some(url);
    }
    if let Some(key) = args.api_key {
        config.agent.api_key = Some(key);
    }
    // Only override image if user explicitly set a non-default value
    if args.image != "sweagent/swe-agent:latest" || config.env.image.is_none() {
        config.env.image = Some(args.image);
    }
    config.output_dir = args.output_dir;
    config.agent.max_steps = Some(args.max_steps);

    // Problem statement priority: github_url > problem_text > problem_file > config
    if let Some(url) = args.github_url {
        config.problem_statement = ProblemStatementConfigSerde::GithubIssue { url };
    } else if let Some(text) = args.problem_text {
        config.problem_statement = ProblemStatementConfigSerde::Text { text };
    } else if let Some(path) = args.problem_file {
        config.problem_statement = ProblemStatementConfigSerde::TextFile { path };
    }

    let run = match RunSingle::from_run_config(config) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Configuration error: {e}");
            std::process::exit(1);
        }
    };

    match run.run().await {
        Ok(result) => {
            let exit = result
                .info
                .exit_status
                .unwrap_or_else(|| "unknown".to_string());
            println!("Run complete. Exit status: {exit}");
            if let Some(sub) = result.info.submission {
                let preview: String = sub.chars().take(200).collect();
                println!("Submission: {preview}");
            }
        }
        Err(e) => {
            eprintln!("Run failed: {e}");
            std::process::exit(1);
        }
    }
}

async fn quick_stats_command(args: QuickStatsArgs) {
    use forge_types::trajectory::TrajFile;

    let dir = args.directory.clone();
    if !dir.exists() {
        eprintln!("Directory {:?} does not exist", dir);
        return;
    }

    let mut total = 0usize;
    let mut submitted = 0usize;
    let mut forfeited = 0usize;
    let mut errors = 0usize;
    let mut step_limit = 0usize;

    // Use async I/O to avoid blocking the Tokio executor.
    if let Ok(mut entries) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("traj") {
                total += 1;
                if let Ok(content) = tokio::fs::read_to_string(&path).await {
                    if let Ok(traj) = serde_json::from_str::<TrajFile>(&content) {
                        match traj.info.exit_status.as_deref() {
                            Some("submitted") => submitted += 1,
                            Some("forfeited") => forfeited += 1,
                            Some("error") => errors += 1,
                            Some("step_limit_reached") => step_limit += 1,
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    println!("Trajectory stats for {:?}:", dir);
    println!("  Total:             {total}");
    println!("  Submitted:         {submitted}");
    println!("  Forfeited:         {forfeited}");
    println!("  Errors:            {errors}");
    println!("  Step limit:        {step_limit}");
    println!(
        "  Other:             {}",
        total.saturating_sub(submitted + forfeited + errors + step_limit)
    );
}
