# Nosana Builders Challenge: Personal Shopping & Meal Assistant

![Agent-101](./assets/NosanaBuildersChallengeAgents.jpg)

This project is a submission for the [Nosana Builders Challenge](https://nosana.io/challenge), featuring an advanced AI agent designed to be a Personal Shopping & Meal Assistant. It leverages the Mastra framework to deliver a smart, intuitive, and time-saving experience for managing groceries and meal planning.

## Agent Features & Capabilities

This isn't just a simple chatbot. The Personal Shopping & Meal Assistant is equipped with a powerful suite of tools designed to tackle real-world kitchen and shopping challenges.

### 1. 🧠 Conversational Memory
The agent remembers everything. Using a persistent, file-based memory, it maintains context across sessions, recalls past conversations, and learns user preferences over time. This ensures interactions are always relevant and personalized.

- **Store & Retrieve:** Automatically saves every user message and AI response.
- **Search:** Quickly finds past discussions or tool outputs (e.g., "what was the price of coffee last week?").
- **Context-Aware:** Avoids asking repetitive questions by checking the conversation history first.

### 2. 🛒 Smart Shopping List
A dynamic and interactive shopping list that goes beyond simple item tracking.

- **Add/Remove/View:** Easily manage your shopping list with simple commands.
- **Instant CSV Download:** Generate a downloadable `.csv` file of your shopping list with a single command. The agent provides a data URL that you can copy-paste into your browser to download the file instantly.

### 3. 💸 Amazon Price Optimizer & Deal Finder
This agent doesn't just find products; it finds the *best deal*.

- **Real-Time Search:** Integrates with the Real-Time Amazon Data API to fetch live product information.
- **Automated Price Analysis:** After every search, the agent automatically analyzes the results to identify the cheapest option and any available discounts.
- **Price Tracking:** By leveraging its conversational memory, the agent can compare current prices to historical data from your past searches and advise you if it's a good time to buy.
- **Deal Highlighting:** Automatically points out "Best Seller" and "Amazon Choice" badges to help you make informed decisions.

### 4. 🍲 Time-Aware Meal Suggestions
Get intelligent meal ideas tailored to the time of day and your personal tastes.

- **Automatic Time Detection:** The `mealSuggestionTool` automatically detects the current time to suggest appropriate meals (breakfast, lunch, dinner, or a snack).
- **Personalized Recipes:** Provides complete recipes based on your stated preferences and dietary restrictions.
- **Ingredient Integration:** Instantly add all the ingredients for a suggested meal to your shopping list.

## How It Works

The agent is built on the **Mastra framework** and uses a `qwen2.5:1.5b` model running locally via Ollama for its reasoning capabilities. Its intelligence comes from a set of custom-built tools:

- **`conversationMemoryTool`**: Manages the persistent JSON-based memory.
- **`shoppingListTool`**: Handles all shopping list operations, including CSV generation.
- **`amazonSearchTool`**: Fetches and processes data from the Amazon API.
- **`mealSuggestionTool`**: Generates time-aware and personalized meal ideas.

The agent's "brain" is its system prompt (`your-agent.ts`), which meticulously guides its behavior, ensuring it follows a logical workflow: store the conversation, analyze tool outputs, and provide proactive, helpful responses.

## Get Started

We recommend using [pnpm](https://pnpm.io/installation) for package management.

### Installation

1.  **Fork the repository** and clone it to your local machine.
2.  **Install dependencies:**
    ```sh
    pnpm install
    ```
3.  **Set up your environment:**
    -   Copy the `.env.example` file to a new file named `.env`.
    -   Add your RapidAPI key to the `.env` file to enable the Amazon Search functionality.
        ```
        RAPIDAPI_KEY=your_rapidapi_key_here
        ```
4.  **Run the local development server:**
    ```sh
    pnpm run dev
    ```
    This will start the Mastra playground, which you can access at `http://localhost:8080`.

### Running with Ollama

The agent is configured to work with a local Ollama instance running the `qwen2.s:1.5b` model.

1.  **[Install Ollama](https://ollama.com/download)**.
2.  **Pull the model:**
    ```sh
    ollama pull qwen2.5:1.5b
    ```
3.  **Ensure the Ollama server is running** before starting the `pnpm run dev` command.

## How to Win the Challenge with This Agent

This agent is designed to excel in all four judging categories:

-   **Innovation:** The combination of persistent memory, a price-optimizing product search, and time-aware meal suggestions creates a uniquely intelligent and practical agent that solves multiple real-world problems.
-   **Technical Implementation:** The agent demonstrates clean, modular, and well-documented TypeScript code. It uses a robust, file-based persistence layer for memory and integrates with external APIs, showcasing solid engineering.
-   **Nosana Integration:** The agent is ready for deployment on the Nosana network. Its lightweight model and efficient tools make it a perfect candidate for decentralized GPU computing.
-   **Real-World Impact:** This agent has immediate practical utility. It helps users save money, reduce food waste by planning meals, and streamline their shopping process.

## Building and Running with Docker

To containerize the agent for consistent deployments, including on the Nosana network, follow these steps.

### 1. Set Up Your Environment

Before building the image, you need to provide your API keys in a `.env` file. The Docker build process will use these keys to enable all the agent's features.

-   Copy the example environment file:
    ```sh
    cp .env.example .env
    ```
-   Open the newly created `.env` file and add your secret keys. At a minimum, you'll need the `GOOGLE_API_KEY` for the fallback model to work.

### 2. Build the Docker Image

The `Dockerfile` is configured to securely accept your API keys as build arguments. This prevents your secrets from being stored in the final image layers.

Run the following command, which reads your `.env` file and passes the variables to the build process.

**For Linux/macOS:**

```sh
docker build \
  --build-arg GOOGLE_API_KEY=$(grep GOOGLE_API_KEY .env | cut -d '=' -f2) \
  --build-arg RAPIDAPI_KEY=$(grep RAPIDAPI_KEY .env | cut -d '=' -f2) \
  -t your-dockerhub-username/nosana-agent:latest .
```

**For Windows (PowerShell):**

```powershell
docker build `
  --build-arg GOOGLE_API_KEY=$((Get-Content .env | Select-String "GOOGLE_API_KEY").ToString().Split('=')[1]) `
  --build-arg RAPIDAPI_KEY=$((Get-Content .env | Select-String "RAPIDAPI_KEY").ToString().Split('=')[1]) `
  -t your-dockerhub-username/nosana-agent:latest .
```

> **Note:** Remember to replace `your-dockerhub-username/nosana-agent:latest` with your actual Docker Hub repository name and desired tag.

### 3. Run the Container

Once the image is built, you can run it locally to test it:

```sh
docker run --rm -it your-dockerhub-username/nosana-agent:latest
```

### 4. Push to Docker Hub & Deploy on Nosana

After confirming the container runs as expected, push it to Docker Hub and deploy it on the Nosana network.

-   **Push to Docker Hub:**
    ```sh
    docker push your-dockerhub-username/nosana-agent:latest
    ```
-   **Deploy on Nosana** using your public Docker image URL from Docker Hub.

## Deploying to Render

This project is configured for easy deployment on Render using a `render.yaml` file.

### 1. Create a New Blueprint Service

-   Go to the [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
-   Connect your GitHub repository.
-   Render will automatically detect and use the `render.yaml` file.

### 2. Add Your Environment Variables

Your API keys should be stored as secrets in Render, not in your repository.

-   In your Render service dashboard, go to the **Environment** tab.
-   Under **Secret Files**, create a new secret file with the filename `.env`.
-   Copy the contents of your local `.env` file (containing your `GOOGLE_API_KEY` and `RAPIDAPI_KEY`) and paste them into the secret file content.
-   Click **Save Changes**.

### 3. Deploy

Render will automatically trigger a new build and deploy your service. Any future pushes to your main branch will also trigger automatic deployments.
