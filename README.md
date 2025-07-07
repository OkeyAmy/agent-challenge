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
-   **Nosana Integration:** The agent is ready for deployment on the Nosana network. Its lightweight model and efficient tools make it a perfect candidate for decentralized GPU computing. (Instructions for Dockerization and deployment are included below).
-   **Real-World Impact:** This agent has immediate practical utility. It helps users save money, reduce food waste by planning meals, and streamline their shopping process.

## Dockerization & Nosana Deployment

Follow the official challenge instructions for building, publishing, and deploying your Docker container to the Nosana network.

1.  **Build your Docker image:**
    ```sh
    docker build -t your-dockerhub-username/nosana-agent:latest .
    ```
2.  **Push to Docker Hub:**
    ```sh
    docker push your-dockerhub-username/nosana-agent:latest
    ```
3.  **Deploy on Nosana** using your public Docker image URL.
