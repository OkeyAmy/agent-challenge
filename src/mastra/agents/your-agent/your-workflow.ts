import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { model } from "../../config";

// Import real tools
import {
  shoppingListTool,
  amazonSearchTool,
  mealSuggestionTool,
  conversationMemoryTool,
} from "./your-tool";

const agent = new Agent({
  name: "Personal Shopping & Meal Assistant",
  model,
  instructions: `
    You are a comprehensive personal assistant specializing in meal planning and shopping organization.

    For each request, structure your response as follows:

    📋 REQUEST ANALYSIS
    ═══════════════════════════

    🎯 IDENTIFIED NEED
    • Request type: [meal planning/shopping/general assistance]
    • Preferences: [dietary preferences or product specifications]
    • Context: [time-based or situational context]

    🛠️ ACTIONS TAKEN
    • [Action 1 completed]
    • [Action 2 completed]
    • [Action 3 completed]

    📊 RESULTS & RECOMMENDATIONS
    For meal requests:
    • Meal suggested: [meal name]
    • Cooking time: [X minutes]
    • Ingredients added to shopping list
    • Download link provided

    For shopping requests:
    • Products found: [X items on Amazon]
    • Best value: [product name] at [price]
    • Added to shopping list: [items]

    💭 CONVERSATION CONTEXT
    • Stored this interaction for future reference
    • Previous context: [relevant past discussions]

    📥 NEXT STEPS
    • [Actionable next steps for the user]

    Guidelines:
    - Always store conversations in memory first
    - Provide specific, actionable recommendations
    - Include real product data and prices when searching
    - Reference past conversations when relevant
    - Focus on solving immediate needs efficiently
    - Always include the link to the amazon product in the response
  `,
});

// Define schemas
const requestAnalysisSchema = z.object({
  userRequest: z.string(),
  requestType: z.enum(["meal", "shopping", "general"]),
  preferences: z.string().optional(),
  context: z.string(),
});

const processedDataSchema = z.object({
  mealData: z
    .object({
      name: z.string(),
      cookingTime: z.string(),
      ingredients: z.array(
        z.object({
          item: z.string(),
          quantity: z.number(),
          unit: z.string(),
        })
      ),
      instructions: z.array(z.string()),
    })
    .optional(),
  shoppingData: z
    .object({
      products: z.array(
        z.object({
          title: z.string(),
          price: z.string().optional(),
          rating: z.string().optional(),
          ingredient: z.string().optional(),
          url: z.string().optional(),
        })
      ),
      priceAnalysis: z.string(),
    })
    .optional(),
  conversationStored: z.boolean(),
  actionsCompleted: z.array(z.string()),
});

// Step 1: Analyze user request
const analyzeUserRequest = createStep({
  id: "analyze-user-request",
  description: "Analyze user request and store in conversation memory",
  inputSchema: z.object({
    userMessage: z.string().describe("The user's message or request"),
  }),
  outputSchema: requestAnalysisSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    const { userMessage } = inputData;

    // Determine request type based on keywords
    const lowerMessage = userMessage.toLowerCase();
    let requestType: "meal" | "shopping" | "general" = "general";
    let preferences = "";

    if (
      lowerMessage.includes("meal") ||
      lowerMessage.includes("food") ||
      lowerMessage.includes("recipe") ||
      lowerMessage.includes("cook") ||
      lowerMessage.includes("eat") ||
      lowerMessage.includes("hungry")
    ) {
      requestType = "meal";
    } else if (
      lowerMessage.includes("buy") ||
      lowerMessage.includes("shop") ||
      lowerMessage.includes("search") ||
      lowerMessage.includes("find") ||
      lowerMessage.includes("amazon")
    ) {
      requestType = "shopping";
    }

    // Extract preferences
    if (lowerMessage.includes("vegetarian")) preferences += "vegetarian ";
    if (lowerMessage.includes("healthy")) preferences += "healthy ";
    if (lowerMessage.includes("quick")) preferences += "quick ";

    const currentTime = new Date().toLocaleString();
    const context = `Request processed at ${currentTime}. Type: ${requestType}${
      preferences ? `. Preferences: ${preferences.trim()}` : ""
    }`;

    return {
      userRequest: userMessage,
      requestType,
      preferences: preferences.trim() || undefined,
      context,
    };
  },
});

// Step 2: Process request based on type
const processRequest = createStep({
  id: "process-request",
  description:
    "Process the request using appropriate tools based on request type",
  inputSchema: requestAnalysisSchema,
  outputSchema: processedDataSchema,
  execute: async ({ inputData }) => {
    const requestData = inputData;

    if (!requestData) {
      throw new Error("Request data not found");
    }

    // Store conversation in memory using the real tool first
    await conversationMemoryTool.execute({
      context: {
        action: "store",
        userMessage: requestData.userRequest,
        aiResponse: "", // placeholder – will be updated later
        context: requestData.context,
        limit: 10,
      },
      runtimeContext: {} as any,
    });

    const actionsCompleted: string[] = [
      "Analyzed user request",
      "Stored conversation in memory",
    ];

    let mealData: any = undefined;
    let shoppingData: any = undefined;

    if (
      requestData.requestType === "meal" ||
      requestData.requestType === "general"
    ) {
      /* --------------------------------------------------
       * 1.  Generate meal suggestion with real tool
       * -------------------------------------------------- */
      const mealResult = await mealSuggestionTool.execute({
        context: {
          preferences: requestData.preferences,
          dietaryRestrictions: requestData.preferences?.includes("vegetarian")
            ? ["vegetarian"]
            : undefined,
          servings: 2,
        },
        runtimeContext: {} as any,
      });

      if (!mealResult.success || !mealResult.meal) {
        throw new Error("Meal suggestion tool failed to generate a meal");
      }

      mealData = {
        name: mealResult.meal.name,
        cookingTime: mealResult.meal.cookingTime,
        ingredients: mealResult.meal.ingredients,
        instructions: mealResult.meal.instructions,
      };

      actionsCompleted.push("Generated meal suggestion");

      /* --------------------------------------------------
       * 2.  Add ingredients to shopping list via tool
       * -------------------------------------------------- */
      await shoppingListTool.execute({
        context: {
          action: "add",
          items: mealResult.meal.ingredients.map((ing) => ({
            item: ing.item,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
        },
        runtimeContext: {} as any,
      });

      actionsCompleted.push("Added ingredients to shopping list");

      /* --------------------------------------------------
       * 3.  Search Amazon for each ingredient & optimize price
       * -------------------------------------------------- */
      const productAggregated: Array<{
        title: string;
        price?: string;
        rating?: string;
        ingredient: string;
        url?: string;
      }> = [];

      for (const ing of mealResult.meal.ingredients) {
        const amazonRes = await amazonSearchTool.execute({
          context: {
            productQuery: ing.item,
            country: "US",
          },
          runtimeContext: {} as any,
        });

        if (
          amazonRes.success &&
          amazonRes.products &&
          amazonRes.products.length > 0
        ) {
          // pick cheapest available product with a numeric price
          const cheapest = amazonRes.products
            .filter((p) => p.price)
            .sort(
              (a, b) =>
                parseFloat((a.price || "").replace(/[^0-9.]/g, "")) -
                parseFloat((b.price || "").replace(/[^0-9.]/g, ""))
            )[0];

          productAggregated.push({
            title: cheapest.title,
            price: cheapest.price,
            rating: cheapest.rating,
            ingredient: ing.item,
            url: cheapest.url,
          });
        }
      }

      shoppingData = {
        products: productAggregated,
        priceAnalysis:
          productAggregated.length > 0
            ? `Optimized prices for ${productAggregated.length} ingredient(s)`
            : "No product prices available",
      };

      actionsCompleted.push("Searched Amazon and optimized prices");
    } else if (requestData.requestType === "shopping") {
      /* --------------------------------------------------
       * Handle direct shopping request
       * -------------------------------------------------- */
      const searchRes = await amazonSearchTool.execute({
        context: {
          productQuery: requestData.userRequest,
          country: "US",
        },
        runtimeContext: {} as any,
      });

      const products = searchRes.products || [];
      let priceAnalysis = "No product pricing information";

      if (products.length) {
        const cheapest = products
          .filter((p) => p.price)
          .sort(
            (a, b) =>
              parseFloat((a.price || "").replace(/[^0-9.]/g, "")) -
              parseFloat((b.price || "").replace(/[^0-9.]/g, ""))
          )[0];
        priceAnalysis = cheapest
          ? `Cheapest option: ${cheapest.title} at ${cheapest.price}`
          : priceAnalysis;
      }

      shoppingData = {
        products: products.map((p) => ({
          title: p.title,
          price: p.price,
          rating: p.rating,
          ingredient: p.title,
          url: p.url,
        })),
        priceAnalysis,
      };

      // Add search term to shopping list
      await shoppingListTool.execute({
        context: {
          action: "add",
          items: [{ item: requestData.userRequest, quantity: 1, unit: "item" }],
        },
        runtimeContext: {} as any,
      });

      actionsCompleted.push(
        "Searched Amazon products",
        "Added item to shopping list"
      );
    }

    return {
      mealData,
      shoppingData,
      conversationStored: true,
      actionsCompleted,
    };
  },
});

// Step 3: Generate comprehensive response
const generateFinalResponse = createStep({
  id: "generate-final-response",
  description: "Generate the final structured response for the user",
  inputSchema: processedDataSchema,
  outputSchema: z.object({
    response: z.string(),
  }),
  execute: async ({ inputData }) => {
    const processedData = inputData;

    if (!processedData) {
      throw new Error("Processed data not found");
    }

    const prompt = `Generate a comprehensive response based on this processed data:

${JSON.stringify(processedData, null, 2)}

Follow the structured format from your instructions. For the "RESULTS & RECOMMENDATIONS" section, when listing products from 'shoppingData', you MUST format them as markdown links using the 'title' and 'url' fields, like this: '[Product Title](Product URL)'. Also include the price and any other relevant details.`;

    const response = await agent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let responseText = "";

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      responseText += chunk;
    }

    return {
      response: responseText,
    };
  },
});

// Create the main workflow
const personalAssistantWorkflow = createWorkflow({
  id: "personal-assistant-workflow",
  inputSchema: z.object({
    userMessage: z.string().describe("The user's message or request"),
  }),
  outputSchema: z.object({
    response: z.string(),
  }),
})
  .then(analyzeUserRequest)
  .then(processRequest)
  .then(generateFinalResponse);

personalAssistantWorkflow.commit();

export { personalAssistantWorkflow }; 