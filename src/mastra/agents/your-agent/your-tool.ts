import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fs from "fs";
import path from "path";

// Types for Amazon API response
interface AmazonProduct {
  asin: string;
  product_title: string;
  product_price?: string;
  product_original_price?: string | null;
  currency?: string;
  product_star_rating?: string;
  product_num_ratings?: number;
  product_url?: string;
  product_photo?: string;
  is_best_seller?: boolean;
  is_amazon_choice?: boolean;
  is_prime?: boolean;
  product_availability?: string;
}

interface AmazonSearchResponse {
  status: string;
  data?: {
    total_products: number;
    products: AmazonProduct[];
  };
}

// In-memory storage for shopping list (no database)
let shoppingList: Array<{
  item: string;
  quantity: number;
  unit: string;
  id: string;
}> = [];

// In-memory storage for conversation history
let conversationMemory: Array<{
  id: string;
  timestamp: string;
  userMessage: string;
  aiResponse: string;
  context?: string;
  sessionId: string;
  toolOutputs?: Array<{ toolId: string; output?: any }>;
}> = [];

let currentSessionId = Math.random().toString(36).substring(7);

// Persistent memory file
const MEMORY_FILE = path.resolve(process.cwd(), "conversation_memory.json");

// Utility to load memory at startup
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, "utf-8");
      if (data) {
        conversationMemory = JSON.parse(data);
      }
    }
  } catch (err) {
    console.warn("⚠️ Failed to load conversation memory file:", err);
  }
}

// Utility to persist memory after every change
function saveMemory() {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(conversationMemory, null, 2));
  } catch (err) {
    console.warn("⚠️ Failed to save conversation memory file:", err);
  }
}

// Load memory once on startup
loadMemory();

// Shopping List Tool
export const shoppingListTool = createTool({
  id: "shopping-list",
  description: "Manage shopping list - add items, remove items, view list, or generate downloadable file",
  inputSchema: z.object({
    action: z.enum(["add", "remove", "view", "download"]).describe("Action to perform"),
    items: z.array(z.object({
      item: z.string(),
      quantity: z.number(),
      unit: z.string()
    })).optional().describe("Items to add (for add action)"),
    itemNames: z.array(z.string()).optional().describe("Item names to remove (for remove action)")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    list: z.array(z.object({
      item: z.string(),
      quantity: z.number(),
      unit: z.string(),
      id: z.string()
    })).optional(),
    downloadContent: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { action, items, itemNames } = context;

    switch (action) {
      case "add":
        if (!items || items.length === 0) {
          return {
            success: false,
            message: "No items provided to add"
          };
        }
        
        items.forEach(item => {
          shoppingList.push({
            ...item,
            id: Math.random().toString(36).substring(7)
          });
        });
        
        // Generate downloadable CSV content
        const csvData = generateShoppingListCSV(shoppingList);
        const addDownloadLink = generateDownloadLink(csvData, "shopping-list.csv");
        
        return {
          success: true,
          message: `✅ Added ${items.length} item(s) to your shopping list.\n\n${addDownloadLink}`,
          list: shoppingList,
          downloadContent: addDownloadLink
        };

      case "remove":
        if (!itemNames || itemNames.length === 0) {
          return {
            success: false,
            message: "No item names provided to remove"
          };
        }
        
        const initialLength = shoppingList.length;
        shoppingList = shoppingList.filter(item => 
          !itemNames.some(name => 
            item.item.toLowerCase().includes(name.toLowerCase())
          )
        );
        
        const removedCount = initialLength - shoppingList.length;
        return {
          success: true,
          message: `Removed ${removedCount} item(s) from shopping list`,
          list: shoppingList
        };

      case "view":
        return {
          success: true,
          message: shoppingList.length > 0 
            ? `Current shopping list has ${shoppingList.length} items`
            : "Shopping list is empty",
          list: shoppingList
        };

      case "download":
        const csvContent = generateShoppingListCSV(shoppingList);
        const downloadLink = generateDownloadLink(csvContent, "shopping-list.csv");
        return {
          success: true,
          message: `📋 Shopping list ready with ${shoppingList.length} items.\n\n${downloadLink}`,
          list: shoppingList,
          downloadContent: downloadLink
        };

      default:
        return {
          success: false,
          message: "Invalid action"
        };
    }
  },
});

// Amazon Search Tool
export const amazonSearchTool = createTool({
  id: "amazon-search",
  description: "Search for products on Amazon using real API",
  inputSchema: z.object({
    productQuery: z.string().describe("Product name or search query"),
    country: z.string().default("US").describe("Country code for Amazon search")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    products: z.array(z.object({
      title: z.string(),
      price: z.string().optional(),
      rating: z.string().optional(),
      url: z.string().optional(),
      image: z.string().optional(),
      asin: z.string(),
      isBestSeller: z.boolean().optional(),
      isAmazonChoice: z.boolean().optional(),
      isPrime: z.boolean().optional()
    })).optional()
  }),
  execute: async ({ context }) => {
    try {
      const { productQuery, country } = context;
      const products = await searchAmazonAPI(productQuery, country);
      
      if (products.length === 0) {
        return {
          success: false,
          message: `No products found for "${productQuery}"`
        };
      }

      const formattedProducts = products.map(product => ({
        title: product.product_title,
        price: product.product_price,
        rating: product.product_star_rating,
        url: product.product_url,
        image: product.product_photo,
        asin: product.asin,
        isBestSeller: product.is_best_seller,
        isAmazonChoice: product.is_amazon_choice,
        isPrime: product.is_prime
      }));

      return {
        success: true,
        message: `Found ${products.length} products for "${productQuery}"`,
        products: formattedProducts
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to search Amazon: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Meal Suggestion Tool
export const mealSuggestionTool = createTool({
  id: "meal-suggestion",
  description: "Generate meal suggestions based on user preferences and dietary requirements",
  inputSchema: z.object({
    preferences: z.string().optional().describe("User's food preferences or cravings (optional)"),
    dietaryRestrictions: z.array(z.string()).optional().describe("Dietary restrictions"),
    mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional().describe("Type of meal"),
    servings: z.number().default(2).describe("Number of servings")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    meal: z.object({
      name: z.string(),
      description: z.string(),
      cookingTime: z.string(),
      difficulty: z.enum(["easy", "medium", "hard"]),
      calories: z.number(),
      macros: z.object({
        protein: z.number(),
        carbs: z.number(),
        fat: z.number()
      }),
      ingredients: z.array(z.object({
        item: z.string(),
        quantity: z.number(),
        unit: z.string()
      })),
      instructions: z.array(z.string())
    }).optional(),
    shoppingListItems: z.array(z.object({
      item: z.string(),
      quantity: z.number(),
      unit: z.string()
    })).optional()
  }),
  execute: async ({ context }) => {
    try {
      const { preferences, dietaryRestrictions, mealType, servings } = context;
      
      // Automatically get current time and date information
      const timeInfo = getCurrentTimeAndDate();
      
      // Generate meal suggestion based on preferences with time context
      const meal = generateMealSuggestion(preferences, dietaryRestrictions, mealType, servings, timeInfo);
      
      return {
        success: true,
        message: `🍽️ Generated meal suggestion for ${timeInfo.currentDate} at ${timeInfo.currentTime} - Perfect for ${timeInfo.timeContext}: ${meal.name}`,
        meal,
        shoppingListItems: meal.ingredients
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to generate meal suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});

// Conversation Memory Tool
export const conversationMemoryTool = createTool({
  id: "conversation-memory",
  description: "Manage conversation memory - store, retrieve, update, or search past conversations, including tool outputs",
  inputSchema: z.object({
    action: z.enum(["store", "retrieve", "search", "update", "delete", "clear"]).describe("Action to perform"),
    userMessage: z.string().optional().describe("User's message to store"),
    aiResponse: z.string().optional().describe("AI's response to store"),
    toolOutputs: z
      .array(
        z.object({
          toolId: z.string(),
          output: z.any().optional(),
        })
      )
      .optional()
      .describe("Outputs from other tools to store in memory for this turn"),
    context: z.string().optional().describe("Additional context about the conversation"),
    conversationId: z.string().optional().describe("ID of conversation to update/delete"),
    searchQuery: z.string().optional().describe("Search term to find in past conversations"),
    limit: z.number().default(10).describe("Maximum number of conversations to return")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    conversations: z
      .array(
        z.object({
          id: z.string(),
          timestamp: z.string(),
          userMessage: z.string(),
          aiResponse: z.string(),
          context: z.string().optional(),
          sessionId: z.string(),
          toolOutputs: z
            .array(
              z.object({
                toolId: z.string(),
                output: z.any().optional(),
              })
            )
            .optional(),
        })
      )
      .optional(),
    totalCount: z.number().optional()
  }),
  execute: async ({ context }) => {
    const { action, userMessage, aiResponse, context: conversationContext, conversationId, searchQuery, limit, toolOutputs } = context;

    switch (action) {
      case "store":
        // Accept an *empty* aiResponse string as a placeholder so the agent can
        // record the message first and update the response later. We only
        // guard against a completely missing (undefined) value.
        if (typeof userMessage !== "string" || userMessage.trim() === "") {
          return {
            success: false,
            message: "userMessage is required for storing"
          };
        }

        if (aiResponse === undefined) {
          return {
            success: false,
            message: "aiResponse must be provided (can be an empty string if not generated yet)"
          };
        }
        
        const newConversation = {
          id: Math.random().toString(36).substring(7),
          timestamp: new Date().toISOString(),
          userMessage,
          aiResponse,
          context: conversationContext,
          sessionId: currentSessionId,
          toolOutputs,
        };
        
        conversationMemory.push(newConversation);
        saveMemory();
        
        return {
          success: true,
          message: `💾 Conversation stored in memory (Total: ${conversationMemory.length})`,
          conversations: [newConversation],
          totalCount: conversationMemory.length
        };

      case "retrieve":
        const recentConversations = conversationMemory
          .slice(-limit)
          .reverse(); // Most recent first
        
        return {
          success: true,
          message: `📚 Retrieved ${recentConversations.length} recent conversations`,
          conversations: recentConversations,
          totalCount: conversationMemory.length
        };

      case "search":
        if (!searchQuery) {
          return {
            success: false,
            message: "Search query is required"
          };
        }
        
        const searchResults = conversationMemory
          .filter(
            (conv) =>
              conv.userMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
              conv.aiResponse.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (conv.context && conv.context.toLowerCase().includes(searchQuery.toLowerCase())) ||
              (conv.toolOutputs && JSON.stringify(conv.toolOutputs).toLowerCase().includes(searchQuery.toLowerCase()))
          )
          .slice(-limit)
          .reverse();
        
        return {
          success: true,
          message: `🔍 Found ${searchResults.length} conversations matching "${searchQuery}"`,
          conversations: searchResults,
          totalCount: searchResults.length
        };

      case "update":
        if (!conversationId) {
          return {
            success: false,
            message: "Conversation ID is required for updating"
          };
        }
        
        const convIndex = conversationMemory.findIndex(conv => conv.id === conversationId);
        if (convIndex === -1) {
          return {
            success: false,
            message: "Conversation not found"
          };
        }
        
        if (userMessage) conversationMemory[convIndex].userMessage = userMessage;
        if (aiResponse) conversationMemory[convIndex].aiResponse = aiResponse;
        if (conversationContext) conversationMemory[convIndex].context = conversationContext;
        if (toolOutputs) conversationMemory[convIndex].toolOutputs = toolOutputs;
        
        saveMemory();
        
        return {
          success: true,
          message: "✏️ Conversation updated successfully",
          conversations: [conversationMemory[convIndex]]
        };

      case "delete":
        if (!conversationId) {
          return {
            success: false,
            message: "Conversation ID is required for deletion"
          };
        }
        
        const deleteIndex = conversationMemory.findIndex(conv => conv.id === conversationId);
        if (deleteIndex === -1) {
          return {
            success: false,
            message: "Conversation not found"
          };
        }
        
        conversationMemory.splice(deleteIndex, 1);
        saveMemory();
        
        return {
          success: true,
          message: "🗑️ Conversation deleted successfully",
          totalCount: conversationMemory.length
        };

      case "clear":
        const clearedCount = conversationMemory.length;
        conversationMemory = [];
        currentSessionId = Math.random().toString(36).substring(7);
        saveMemory();
        
        return {
          success: true,
          message: `🧹 Cleared ${clearedCount} conversations from memory`,
          totalCount: 0
        };

      default:
        return {
          success: false,
          message: "Invalid action"
        };
    }
  },
});

// Helper functions
function generateShoppingListCSV(items: any[]): string {
  const header = "Item,Quantity,Unit\n";
  // Avoid smart-quote confusion by omitting wrapping quotes unless necessary
  const sanitize = (str: string) => str.replace(/"/g, "'" ); // replace existing double-quotes to keep CSV valid
  const rows = items
    .map(({ item, quantity, unit }) => `${sanitize(item)},${quantity},${sanitize(unit)}`)
    .join("\n");
  return header + rows;
}

// Date and Time Helper Function
function getCurrentTimeAndDate() {
  const now = new Date();
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  };
  const dateOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  
  return {
    currentTime: now.toLocaleTimeString('en-US', timeOptions),
    currentDate: now.toLocaleDateString('en-US', dateOptions),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    hour: now.getHours(),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    timeContext: getTimeContext(now.getHours()),
    timestamp: now.toISOString()
  };
}

function getTimeContext(hour: number): string {
  if (hour >= 5 && hour < 10) return "early morning";
  if (hour >= 10 && hour < 12) return "late morning";
  if (hour >= 12 && hour < 14) return "lunch time";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "dinner time";
  if (hour >= 20 && hour < 23) return "evening";
  return "late night";
}

function generateDownloadLink(csvContent: string, filename: string): string {
  // Create a clean data URL that users can copy and paste into their browser
  const encodedUri = encodeURIComponent(csvContent);
  const dataUrl = `data:text/csv;charset=utf-8,${encodedUri}`;
  return `📥 **Download Link:** Copy and paste this URL into your browser address bar to download ${filename}:\n\n\`${dataUrl}\`\n\nOr right-click and "Save As" to download the file directly.`;
}

async function searchAmazonAPI(productQuery: string, country: string = "US"): Promise<AmazonProduct[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  
  if (!apiKey) {
    // Return mock data when API key is not configured
    console.warn("RapidAPI key not configured, returning mock data");
    return [
      {
        asin: "B08N5WRWNW",
        product_title: `Mock ${productQuery} - Premium Quality`,
        product_price: "$19.99",
        product_star_rating: "4.5",
        product_num_ratings: 1250,
        product_url: "https://amazon.com/mock-product",
        product_photo: "https://via.placeholder.com/300x300?text=Mock+Product",
        is_best_seller: true,
        is_amazon_choice: false,
        is_prime: true,
        product_availability: "In Stock"
      },
      {
        asin: "B08N5WRWNY",
        product_title: `${productQuery} - Budget Option`,
        product_price: "$12.99",
        product_star_rating: "4.2",
        product_num_ratings: 890,
        product_url: "https://amazon.com/mock-product-2",
        product_photo: "https://via.placeholder.com/300x300?text=Budget+Option",
        is_best_seller: false,
        is_amazon_choice: true,
        is_prime: true,
        product_availability: "In Stock"
      }
    ];
  }

  try {
    const url = "https://real-time-amazon-data.p.rapidapi.com/search";
    const querystring = new URLSearchParams({
      query: productQuery,
      page: "1",
      country: country,
      sort_by: "RELEVANCE",
      is_prime: "false"
    });

    const headers = {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "real-time-amazon-data.p.rapidapi.com"
    };

    const response = await fetch(`${url}?${querystring}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Amazon API request failed with status: ${response.status}`);
    }

    const data: AmazonSearchResponse = await response.json();
    
    if (data.status !== "OK" || !data.data || !data.data.products) {
      throw new Error('Invalid response format from Amazon API');
    }

    return data.data.products.slice(0, 3) || [];
  } catch (error) {
    console.error("Amazon API error:", error);
    // Fallback to mock data on API failure
    return [
      {
        asin: "B08N5WRWNW",
        product_title: `${productQuery} - API Error Fallback`,
        product_price: "$19.99",
        product_star_rating: "4.5",
        product_num_ratings: 1250,
        product_url: "https://amazon.com/search?k=" + encodeURIComponent(productQuery),
        product_photo: "https://via.placeholder.com/300x300?text=Product",
        is_best_seller: false,
        is_amazon_choice: false,
        is_prime: true,
        product_availability: "Check Amazon"
      }
    ];
  }
}

function generateMealSuggestion(
  preferences?: string,
  dietaryRestrictions?: string[],
  mealType?: string,
  servings: number = 2,
  timeInfo?: ReturnType<typeof getCurrentTimeAndDate>
) {
  // Simple meal generation based on preferences with time context
  // In a real implementation, this would use a recipe API or more sophisticated logic
  
  // Auto-detect meal type based on time if not provided
  let detectedMealType = mealType;
  if (!mealType && timeInfo) {
    if (timeInfo.hour >= 5 && timeInfo.hour < 11) detectedMealType = "breakfast";
    else if (timeInfo.hour >= 11 && timeInfo.hour < 16) detectedMealType = "lunch";
    else if (timeInfo.hour >= 16 && timeInfo.hour < 22) detectedMealType = "dinner";
    else detectedMealType = "snack";
  }

  // Time-aware meal suggestions
  const breakfastMeals = [
    {
      name: "Avocado Toast with Eggs",
      description: `Perfect ${timeInfo?.timeContext || 'morning'} breakfast for ${timeInfo?.dayOfWeek || 'today'}`,
      cookingTime: "15 minutes",
      difficulty: "easy" as const,
      calories: 320,
      macros: { protein: 18, carbs: 24, fat: 16 },
      ingredients: [
        { item: "Whole grain bread", quantity: servings * 2, unit: "slices" },
        { item: "Avocado", quantity: servings, unit: "pieces" },
        { item: "Eggs", quantity: servings * 2, unit: "pieces" },
        { item: "Cherry tomatoes", quantity: servings * 0.5, unit: "cups" },
        { item: "Salt and pepper", quantity: 1, unit: "pinch" }
      ],
      instructions: [
        "Toast bread slices until golden",
        "Mash avocado with salt and pepper",
        "Fry or poach eggs to preference",
        "Spread avocado on toast, top with egg",
        "Garnish with cherry tomatoes and serve"
      ]
    }
  ];

  const lunchMeals = [
    {
      name: "Mediterranean Quinoa Bowl",
      description: `Energizing ${timeInfo?.timeContext || 'lunch'} bowl perfect for ${timeInfo?.dayOfWeek || 'today'}`,
      cookingTime: "25 minutes",
      difficulty: "medium" as const,
      calories: 380,
      macros: { protein: 16, carbs: 52, fat: 14 },
      ingredients: [
        { item: "Quinoa", quantity: servings * 0.75, unit: "cups" },
        { item: "Cucumber", quantity: 1, unit: "piece" },
        { item: "Cherry tomatoes", quantity: servings, unit: "cups" },
        { item: "Feta cheese", quantity: servings * 50, unit: "grams" },
        { item: "Olive oil", quantity: 3, unit: "tablespoons" }
      ],
      instructions: [
        "Cook quinoa according to package directions",
        "Dice cucumber and halve cherry tomatoes",
        "Crumble feta cheese",
        "Mix all ingredients with olive oil",
        "Season and serve at room temperature"
      ]
    }
  ];

  const dinnerMeals = [
    {
      name: "Grilled Salmon with Roasted Vegetables",
      description: `Satisfying ${timeInfo?.timeContext || 'dinner'} for a relaxing ${timeInfo?.dayOfWeek || 'evening'}`,
      cookingTime: "35 minutes",
      difficulty: "medium" as const,
      calories: 450,
      macros: { protein: 38, carbs: 22, fat: 24 },
      ingredients: [
        { item: "Salmon fillets", quantity: servings, unit: "pieces" },
        { item: "Sweet potatoes", quantity: servings, unit: "pieces" },
        { item: "Broccoli", quantity: 1, unit: "head" },
        { item: "Olive oil", quantity: 3, unit: "tablespoons" },
        { item: "Lemon", quantity: 1, unit: "piece" }
      ],
      instructions: [
        "Preheat oven to 400°F (200°C)",
        "Cut sweet potatoes and toss with oil",
        "Roast vegetables for 25 minutes",
        "Season and grill salmon 4-5 minutes per side",
        "Serve with lemon wedges"
      ]
    }
  ];

  const snackMeals = [
    {
      name: "Greek Yogurt Parfait",
      description: `Light ${timeInfo?.timeContext || 'snack'} perfect for ${timeInfo?.dayOfWeek || 'any time'}`,
      cookingTime: "5 minutes",
      difficulty: "easy" as const,
      calories: 180,
      macros: { protein: 15, carbs: 22, fat: 4 },
      ingredients: [
        { item: "Greek yogurt", quantity: servings, unit: "cups" },
        { item: "Mixed berries", quantity: servings * 0.5, unit: "cups" },
        { item: "Granola", quantity: servings * 0.25, unit: "cups" },
        { item: "Honey", quantity: servings, unit: "tablespoons" }
      ],
      instructions: [
        "Layer yogurt in serving bowls",
        "Add berries and granola",
        "Drizzle with honey",
        "Serve immediately"
      ]
    }
  ];

  // Select appropriate meal based on detected meal type
  let mealOptions;
  switch (detectedMealType) {
    case "breakfast":
      mealOptions = breakfastMeals;
      break;
    case "lunch":
      mealOptions = lunchMeals;
      break;
    case "dinner":
      mealOptions = dinnerMeals;
      break;
    case "snack":
      mealOptions = snackMeals;
      break;
    default:
      // Fallback to lunch options
      mealOptions = lunchMeals;
  }

  // Simple selection based on preferences
  let selectedMeal = mealOptions[0];
  
  // Adjust selection based on preferences
  if (preferences && (preferences.toLowerCase().includes("salmon") || preferences.toLowerCase().includes("fish"))) {
    selectedMeal = dinnerMeals[0];
  } else if (preferences && (preferences.toLowerCase().includes("vegetarian") || preferences.toLowerCase().includes("quinoa"))) {
    selectedMeal = lunchMeals[0];
  }

  // Adjust for dietary restrictions
  if (dietaryRestrictions?.includes("vegetarian") || dietaryRestrictions?.includes("vegan")) {
    // Return vegetarian option based on meal type
    if (detectedMealType === "breakfast") {
      selectedMeal = breakfastMeals[0];
    } else if (detectedMealType === "snack") {
      selectedMeal = snackMeals[0];
    } else {
      selectedMeal = lunchMeals[0]; // Quinoa bowl is vegetarian
    }
  }

  // Add time context to the description if available
  if (timeInfo) {
    selectedMeal = {
      ...selectedMeal,
      description: `${selectedMeal.description} - Suggested at ${timeInfo.currentTime} on ${timeInfo.dayOfWeek}`
    };
  }

  return selectedMeal;
}
