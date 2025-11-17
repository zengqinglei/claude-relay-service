/**
 * Gemini 与 OpenAI 格式转换工具
 *
 * 提供 OpenAI 和 Gemini API 之间的格式转换功能
 *
 * @module geminiFormatConverter
 */

/**
 * 辅助函数：从各种格式中提取文本内容
 *
 * @param {*} content - 可以是字符串、对象、数组等多种格式
 * @returns {string} - 提取的文本内容
 * @private
 */
function extractTextContent(content) {
  // 处理 null 或 undefined
  if (content === null || content === undefined) {
    return ''
  }

  // 处理字符串
  if (typeof content === 'string') {
    return content
  }

  // 处理数组格式的内容
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item === null || item === undefined) {
          return ''
        }
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object') {
          // 处理 {type: 'text', text: '...'} 格式
          if (item.type === 'text' && item.text) {
            return item.text
          }
          // 处理 {text: '...'} 格式
          if (item.text) {
            return item.text
          }
          // 处理嵌套的对象或数组
          if (item.content) {
            return extractTextContent(item.content)
          }
        }
        return ''
      })
      .join('')
  }

  // 处理对象格式的内容
  if (typeof content === 'object') {
    // 处理 {text: '...'} 格式
    if (content.text) {
      return content.text
    }
    // 处理 {content: '...'} 格式
    if (content.content) {
      return extractTextContent(content.content)
    }
    // 处理 {parts: [{text: '...'}]} 格式
    if (content.parts && Array.isArray(content.parts)) {
      return content.parts
        .map((part) => {
          if (part && part.text) {
            return part.text
          }
          return ''
        })
        .join('')
    }
  }

  // 最后的后备选项：只有在内容确实不为空且有意义时才转换为字符串
  if (content !== undefined && content !== null && content !== '' && typeof content !== 'object') {
    return String(content)
  }

  return ''
}

/**
 * 将 OpenAI 消息格式转换为 Gemini 格式
 *
 * @param {Array} messages - OpenAI 格式的消息数组
 * @param {string} messages[].role - 消息角色 ('system', 'user', 'assistant')
 * @param {string|Object|Array} messages[].content - 消息内容
 * @returns {Object} - 包含 contents 和 systemInstruction 的对象
 * @returns {Array} .contents - Gemini 格式的 contents 数组
 * @returns {string} .systemInstruction - 系统指令文本
 *
 * @example
 * const { contents, systemInstruction } = convertOpenAIMessagesToGemini([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ])
 * // contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }]
 * // systemInstruction: 'You are a helpful assistant.'
 */
function convertOpenAIMessagesToGemini(messages) {
  const contents = []
  let systemInstruction = ''

  for (const message of messages) {
    const textContent = extractTextContent(message.content)

    if (message.role === 'system') {
      systemInstruction += (systemInstruction ? '\n\n' : '') + textContent
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: textContent }]
      })
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: textContent }]
      })
    }
  }

  return { contents, systemInstruction }
}

/**
 * 将 Gemini 响应转换为 OpenAI 格式
 *
 * @param {Object} geminiResponse - Gemini API 的响应对象
 * @param {string} model - 模型名称
 * @param {boolean} [stream=false] - 是否为流式响应
 * @returns {Object} - OpenAI 格式的响应对象
 * @throws {Error} - 当响应中没有 candidates 时抛出错误
 *
 * @example
 * const openaiResponse = convertGeminiResponseToOpenAI(geminiResponse, 'gemini-2.0-flash-exp')
 * // {
 * //   id: 'chatcmpl-123...',
 * //   object: 'chat.completion',
 * //   choices: [{ message: { role: 'assistant', content: '...' }, ... }],
 * //   usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
 * // }
 */
function convertGeminiResponseToOpenAI(geminiResponse, model, stream = false) {
  if (stream) {
    // 处理流式响应 - 原样返回 SSE 数据
    return geminiResponse
  } else {
    // 非流式响应转换
    // 处理嵌套的 response 结构
    const actualResponse = geminiResponse.response || geminiResponse

    if (actualResponse.candidates && actualResponse.candidates.length > 0) {
      const candidate = actualResponse.candidates[0]
      const content = candidate.content?.parts?.[0]?.text || ''
      const finishReason = candidate.finishReason?.toLowerCase() || 'stop'

      // 计算 token 使用量
      const usage = actualResponse.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      }

      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content
            },
            finish_reason: finishReason
          }
        ],
        usage: {
          prompt_tokens: usage.promptTokenCount,
          completion_tokens: usage.candidatesTokenCount,
          total_tokens: usage.totalTokenCount
        }
      }
    } else {
      throw new Error('No response from Gemini')
    }
  }
}

module.exports = {
  convertOpenAIMessagesToGemini,
  convertGeminiResponseToOpenAI
}
