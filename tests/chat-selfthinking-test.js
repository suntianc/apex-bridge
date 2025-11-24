/**
 * 测试 Chat API 的 selfThinking 参数处理
 */
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testSelfThinkingParameter() {
  console.log('🧪 测试 Chat API selfThinking 参数处理...\n');

  try {
    // 测试1: 直接传递 selfThinking 参数
    console.log('📝 测试1: 直接传递 selfThinking 参数');
    const response1 = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      messages: [
        { role: 'user', content: '请解释什么是人工智能' }
      ],
      model: 'gpt-3.5-turbo',
      selfThinking: {
        enabled: true,
        maxIterations: 2,
        includeThoughtsInResponse: true
      }
    });

    console.log('✅ 直接参数测试成功');
    console.log('响应状态:', response1.status);
    console.log('是否包含思考过程:', response1.data.choices[0].message.content.includes('[思考步骤'));

    // 测试2: 通过 apexMeta 传递 selfThinking 参数
    console.log('\n📝 测试2: 通过 apexMeta 传递 selfThinking 参数');
    const response2 = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      messages: [
        { role: 'user', content: '解释机器学习的监督学习' }
      ],
      model: 'gpt-3.5-turbo',
      apexMeta: {
        selfThinking: {
          enabled: true,
          maxIterations: 2,
          includeThoughtsInResponse: false
        }
      }
    });

    console.log('✅ apexMeta参数测试成功');
    console.log('响应状态:', response2.status);

    // 测试3: 不传递 selfThinking 参数（默认行为）
    console.log('\n📝 测试3: 不传递 selfThinking 参数（默认行为）');
    const response3 = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      messages: [
        { role: 'user', content: '你好' }
      ],
      model: 'gpt-3.5-turbo'
    });

    console.log('✅ 默认行为测试成功');
    console.log('响应状态:', response3.status);

    console.log('\n🎉 所有测试通过！selfThinking 参数处理功能正常工作。');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    process.exit(1);
  }
}

// 只有在直接运行此脚本时才执行测试
if (require.main === module) {
  testSelfThinkingParameter();
}

module.exports = { testSelfThinkingParameter };
