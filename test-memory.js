const axios = require('axios');

async function testMemoryWrite() {
  try {
    const response = await axios.post('http://localhost:8088/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: '写入一条日记：今天在项目中调通了 worker 路径，很开心。'
        }
      ],
      apexMeta: {
        conversationId: 'conv-diary-1',
        sessionType: 'single'
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-intellicore-api-mhj8zkef-93bfK6zkbxQ-440d320a'
      }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testMemoryWrite();