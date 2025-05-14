'use strict';

const axios = require('axios');
const axiosRetry = require('axios-retry');
const Agent = require('agentkeepalive').HttpsAgent;
const logger = require('../logger');
const { klusterConfig } = require('../../config');
const { transformMessage } = require('../message-transform');

const keepAliveAgent = new Agent(klusterConfig.httpConfig);
const axiosInstance = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: 300 * 1000,
});
axiosRetry(axiosInstance, {
  retries: 3,
  retryCondition: axiosRetry.isRetryableError,
  retryDelay: axiosRetry.exponentialDelay,
});

const sendMessageApi = async (waNumber, user, message, type, caption, mime) => {
  const url = `${klusterConfig.apiUrl}/bots/${klusterConfig.botId}/messages`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${klusterConfig.apiToken}`,
  };
  const responseMessage = transformMessage(message);
  let data = {
    to: user,
  };
  data = Object.assign(data, responseMessage);
  const response = await axiosInstance({
    method: 'post',
    url,
    data,
    headers,
  });
  if (response.status !== 200 && response.status !== 201) {
    logger.error({
      userMobile: user,
      message: 'Error - Swift Send Message API',
      responseCode: response.status,
      requestBody: data,
    });
  } else {
    logger.info({
      userMobile: user,
      message: 'Swift Send Message API',
      responseCode: response.status,
      requestBody: data,
    });
  }
};

function formatTriviaQuestions(questions) {
  return questions.map((q, i) => {
    if (q.type === 'boolean') {
      // True/False question with radio buttons
      return `${i + 1}. ${decodeHtml(q.question)}\n` +
        `<input type="radio" name="q${i}" value="True"> True\n` +
        `<input type="radio" name="q${i}" value="False"> False`;
    } else {
      // Multiple choice: shuffle options
      const options = [q.correct_answer, ...q.incorrect_answers];
      // Shuffle options
      for (let j = options.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [options[j], options[k]] = [options[k], options[j]];
      }
      const optionLabels = ['A', 'B', 'C', 'D'];
      const optionsText = options.map((opt, idx) =>
        `<input type="radio" name="q${i}" value="${decodeHtml(opt)}"> ${optionLabels[idx]}) ${decodeHtml(opt)}`
      ).join('\n');
      return `${i + 1}. ${decodeHtml(q.question)}\n${optionsText}`;
    }
  }).join('\n\n');
}

// Helper to decode HTML entities
function decodeHtml(html) {
  return html.replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const questions = await fetchTriviaQuestions(category, difficulty);
const message = formatTriviaQuestions(questions);
await sendMessageApi(null, userMobile, message, 'text');

module.exports = {
  sendMessageApi,
};
