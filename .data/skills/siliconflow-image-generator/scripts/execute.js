/**
 * SiliconFlow Image Generation Skill - Execution Script
 *
 * This skill generates images using SiliconFlow's image generation API.
 * Supports text-to-image and image-to-image generation with extensive customization.
 */

const axios = require('axios');

// API Configuration
const API_ENDPOINT = 'https://api.siliconflow.cn/v1/images/generations';
const API_KEY = 'sk-zxyaypryaoeunyfnxujwfninpqrupreasfarewmwgklfoutq';
const DEFAULT_MODEL = 'Kwai-Kolors/Kolors';

/**
 * Poll async task status
 */
async function pollTaskStatus(taskId, maxAttempts = 60, interval = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${API_ENDPOINT.replace('/generations', '')}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        timeout: 30000
      });

      const result = response.data;

      if (result.status === 'completed' || result.status === 'succeeded') {
        return result;
      } else if (result.status === 'failed' || result.status === 'error') {
        throw new Error(`Task failed: ${result.error?.message || 'Unknown error'}`);
      }

      if (attempt < maxAttempts) {
        console.error(`[SiliconFlow Image Generator] Task in progress... (${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`Task polling failed: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  throw new Error('Task polling timed out');
}

/**
 * Generate image(s) using SiliconFlow API
 */
async function generateImage(params) {
  // Validate required parameters
  if (!params.prompt) {
    throw new Error('Prompt is required');
  }

  // Prepare request body
  const requestBody = {
    model: DEFAULT_MODEL,
    prompt: params.prompt
  };

  // Add optional parameters if provided
  if (params.negative_prompt && params.negative_prompt.trim()) {
    requestBody.negative_prompt = params.negative_prompt;
  }

  if (params.image_size) {
    requestBody.image_size = params.image_size;
  }

  if (params.batch_size && params.batch_size > 0) {
    requestBody.batch_size = Math.min(params.batch_size, 4); // Max 4 images per batch
  }

  if (params.seed !== undefined) {
    requestBody.seed = params.seed;
  }

  if (params.num_inference_steps) {
    requestBody.num_inference_steps = Math.max(1, Math.min(100, params.num_inference_steps));
  }

  if (params.guidance_scale !== undefined) {
    requestBody.guidance_scale = Math.max(0, Math.min(20, params.guidance_scale));
  }

  if (params.cfg !== undefined) {
    requestBody.cfg = Math.max(0, Math.min(20, params.cfg));
  }

  // Add reference images if provided
  if (params.image) {
    requestBody.image = params.image;
  }
  if (params.image2) {
    requestBody.image2 = params.image2;
  }
  if (params.image3) {
    requestBody.image3 = params.image3;
  }

  try {
    console.error('[SiliconFlow Image Generator] Starting image generation...');
    console.error('[SiliconFlow Image Generator] Model:', DEFAULT_MODEL);
    console.error('[SiliconFlow Image Generator] Prompt:', params.prompt.substring(0, 100) + (params.prompt.length > 100 ? '...' : ''));
    if (params.batch_size) {
      console.error('[SiliconFlow Image Generator] Batch size:', params.batch_size);
    }

    // Make API request
    const response = await axios.post(API_ENDPOINT, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      timeout: 300000 // 5 minutes timeout
    });

    let result = response.data;

    // Check if this is an async task response
    if (result.id && !result.images) {
      console.error('[SiliconFlow Image Generator] Received async task, polling for completion...');
      result = await pollTaskStatus(result.id);
    }

    console.error('[SiliconFlow Image Generator] ✅ Image generation successful!');
    console.error('[SiliconFlow Image Generator] Generated', result.images?.length || 1, 'image(s)');
    console.error('[SiliconFlow Image Generator] Seed:', result.seed);
    if (result.timings?.inference) {
      console.error('[SiliconFlow Image Generator] Inference time:', result.timings.inference, 'seconds');
    }

    return result;

  } catch (error) {
    console.error('[SiliconFlow Image Generator] ❌ Error:', error.message);

    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      console.error('[SiliconFlow Image Generator] Status:', status);
      console.error('[SiliconFlow Image Generator] Error data:', JSON.stringify(errorData, null, 2));

      // Handle specific error cases
      if (status === 401) {
        throw new Error('Authentication failed. Please check your API key.');
      } else if (status === 400) {
        throw new Error(`Invalid request parameters: ${errorData.error?.message || 'Unknown validation error'}`);
      } else if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (status >= 500) {
        throw new Error('SiliconFlow API server error. Please try again later.');
      } else {
        throw new Error(`API request failed with status ${status}: ${errorData.error?.message || error.message}`);
      }
    } else if (error.request) {
      throw new Error('Network error: Unable to reach SiliconFlow API. Please check your internet connection.');
    } else {
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

/**
 * Main execution function
 * This is the entry point when the skill is called
 */
async function main() {
  try {
    // Parse command line arguments or input parameters
    const args = process.argv.slice(2);

    let params = {};

    // Try to parse as JSON (ApexBridge format)
    if (args.length === 1) {
      try {
        params = JSON.parse(args[0]);
      } catch (e) {
        console.error('Failed to parse arguments as JSON:', e.message);
        process.exit(1);
      }
    } else if (args.length > 1) {
      // Fallback: parse as command-line flags
      params = {};
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];

        if (!value) break;

        switch (key) {
          case '--prompt':
            params.prompt = value;
            break;
          case '--negative-prompt':
            params.negative_prompt = value;
            break;
          case '--image-size':
            params.image_size = value;
            break;
          case '--batch-size':
            params.batch_size = parseInt(value);
            break;
          case '--seed':
            params.seed = parseInt(value);
            break;
          case '--num-inference-steps':
            params.num_inference_steps = parseInt(value);
            break;
          case '--guidance-scale':
            params.guidance_scale = parseFloat(value);
            break;
          case '--cfg':
            params.cfg = parseFloat(value);
            break;
          case '--image':
            params.image = value;
            break;
          case '--image2':
            params.image2 = value;
            break;
          case '--image3':
            params.image3 = value;
            break;
        }
      }
    } else {
      console.error('No arguments provided');
      process.exit(1);
    }

    // Execute image generation
    const result = await generateImage(params);

    // Output result as JSON (only this goes to stdout, which becomes ToolResult.output)
    console.log(JSON.stringify({
      success: true,
      images: result.images,
      data: result.data,
      seed: result.seed,
      timings: result.timings,
      render_hint: "返回的图片URL应按照以下Markdown格式进行渲染：![描述](图片URL)"
    }));

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Export the function for use as a module
module.exports = generateImage;

// Run main if executed directly
if (require.main === module) {
  main();
}