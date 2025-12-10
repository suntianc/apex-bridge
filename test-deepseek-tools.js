/**
 * 测试DeepSeek带工具调用的请求
 */

const axios = require('axios');

const tools = [
  {
    "type": "function",
    "function": {
      "name": "vector-search",
      "description": "Search for relevant Skills tools using vector similarity. Use this when you need to find tools to help with a task.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search query describing what kind of tool or functionality you need"
          },
          "limit": {
            "type": "number",
            "description": "Maximum number of results to return (default: 5, max: 20)",
            "default": 5,
            "minimum": 1,
            "maximum": 20
          },
          "threshold": {
            "type": "number",
            "description": "Similarity threshold (0.0 to 1.0, default: 0.6). Higher values = more strict matching",
            "default": 0.6,
            "minimum": 0,
            "maximum": 1
          },
          "includeMetadata": {
            "type": "boolean",
            "description": "Include additional metadata in results",
            "default": false
          }
        },
        "required": ["query"]
      }
    }
  }
];

const messages = [
  {
    "role": "user",
    "content": "我需要网络搜索工具"
  }
];

async function testDeepSeekWithTools() {
  console.log('🧪 Testing DeepSeek with tools...\n');

  const requestBody = {
    model: "deepseek-chat",
    messages: messages,
    tools: tools,
    tool_choice: "auto",
    stream: true,
    temperature: 0.7
  };

  console.log('📤 Request body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('\n');

  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-edcfe0c2c69e4c9f82ff60f16626022a'
      },
      responseType: 'stream'
    });

    console.log('✅ Response received, status:', response.status);

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              console.log('📨 Chunk:', JSON.stringify(parsed, null, 2));
            } catch (e) {
              console.log('📨 Raw data:', data);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📄 Data:', error.response.data);
    }
  }
}

testDeepSeekWithTools();