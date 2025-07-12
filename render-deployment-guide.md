# Render Web Service Deployment Guide

Follow these steps and use these exact values when creating your Web Service on the Render dashboard.

---

### Basic Settings

-   **Name:** `agent-challenge`
-   **Environment:** `Docker`
-   **Region:** `Oregon (US West)` (or your preferred region)
-   **Branch:** `main`

---

### Directory and Build Settings (The Important Part!)

This is the section that will fix the error you were seeing.

-   **Root Directory:** **IMPORTANT: Leave this field BLANK.**
    -   *Why?* Your `Dockerfile` is in the main project folder, not inside `src`. Leaving this blank tells Render to look in the correct place.

-   **Docker Build Context Directory:** Set this to `.`
    -   This tells Docker to use your main project folder as the context for the build.

-   **Dockerfile Path:** Set this to `./Dockerfile`
    -   This tells Render the exact location of your Dockerfile.

---

### Instance and Environment Settings

-   **Instance Type:** Select `Free` for hobby projects.

-   **Environment Variables (Secrets):** This is where you will add your API keys securely.
    1.  Click the **Add Secret File** button.
    2.  In the **Filename** field, enter: `.env`
    3.  In the **Contents** box, paste the following, replacing the placeholders with your actual keys:

        ```
        GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY_HERE
        RAPIDAPI_KEY=YOUR_RAPIDAPI_KEY_HERE
        ```
    4. Click **Save**.

---

### Final Step

-   Leave all other fields with their default values.
-   Click the **Deploy web service** button at the bottom of the page.

Your service should now build and deploy successfully. 