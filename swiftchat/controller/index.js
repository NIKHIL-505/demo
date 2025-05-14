'use strict';

const httpStatus = require('http-status');
const service = require('../service');
const logger = require('../../utils/logger');

// In-memory store for demo (move to DB/Redis for production)
const userQuizState = {};

const klusterWebhook = async (req, res, next) => {
  try {
    const userMobile = req.body.from;
    logger.info({
      userMobile,
      message: 'SwiftChat Message Received',
      requestBody: req.body,
    });
    let userMessage;
    let messageType = req.body.type;
    if (messageType === 'text') {
      userMessage = req.body.text.body;
    } else if (messageType === 'persistent_menu_response') {
      userMessage = (req.body.persistent_menu_response.id - 1).toString();
    } else if (messageType === 'button_response') {
      userMessage = (req.body.button_response.button_index + 1).toString();
    } else if (messageType === 'multi_select_button_response') {
      userMessage = req.body.multi_select_button_response.map(
        (button) => button.button_index + 1
      );
    } else if (messageType === 'location') {
      userMessage = req.body.location;
    }

    await service.klusterWebhook(userMobile, userMessage, messageType, req.body);
    res.sendStatus(httpStatus.OK);
  } catch (e) {
    console.log(e);
    logger.error({
      userMobile: req.body.from,
      message: 'SwiftChat Webhook Error',
      requestBody: req.body,
      error: e,
    });
    return next(e);
  }
};

const messageWebhookTest = async (req, res) => {
  logger.info({
    message: 'Test Webhook Request received',
    requestBody: req.body,
    requestHeaders: req.headers,
  });
  res.sendStatus(httpStatus.OK);
};

// POST /trivia - start trivia, send question
const triviaQuestions = async (req, res, next) => {
  try {
    const { userMobile, category, difficulty } = req.body;
    if (!userMobile || !category || !difficulty) {
      return res.status(400).json({ error: 'userMobile, category and difficulty are required' });
    }
    const questions = await service.fetchTriviaQuestions(category, difficulty);
    if (!questions || questions.length === 0) {
      return res.status(404).json({ error: 'No questions found' });
    }
    const questionObj = questions[0];
    // Prepare options and shuffle
    const options = [questionObj.correct_answer, ...questionObj.incorrect_answers];
    for (let j = options.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [options[j], options[k]] = [options[k], options[j]];
    }
    const optionLabels = ['A', 'B', 'C', 'D'];
    const optionsText = options.map((opt, idx) => `${optionLabels[idx]}) ${opt}`).join('\n');
    const message = `${questionObj.question}\n${optionsText}`;

    // Store correct answer label for validation
    const correctLabel = optionLabels[options.indexOf(questionObj.correct_answer)];
    userQuizState[userMobile] = {
      correctAnswer: correctLabel,
      options,
      question: questionObj.question
    };

    // Send question to user
    await service.sendMessageApi(null, userMobile, message, 'text');
    res.json({ message: 'Question sent', question: questionObj.question, options });
  } catch (e) {
    next(e);
  }
};

// POST /trivia/answer - validate answer
const triviaAnswer = async (req, res, next) => {
  try {
    const { userMobile, answer } = req.body;
    if (!userMobile || !answer) {
      return res.status(400).json({ error: 'userMobile and answer are required' });
    }
    const quizState = userQuizState[userMobile];
    if (!quizState) {
      await service.sendMessageApi(null, userMobile, "No active question. Please start a new quiz.", 'text');
      return res.status(400).json({ error: 'No active question.' });
    }
    if (answer.trim().toUpperCase() === quizState.correctAnswer) {
      await service.sendMessageApi(null, userMobile, "Correct! 🎉", 'text');
      res.json({ result: 'Correct' });
    } else {
      await service.sendMessageApi(
        null,
        userMobile,
        `Wrong! The correct answer was ${quizState.correctAnswer}) ${quizState.options[quizState.correctAnswer.charCodeAt(0) - 65]}.`,
        'text'
      );
      res.json({ result: 'Wrong', correct: quizState.correctAnswer });
    }
    delete userQuizState[userMobile];
  } catch (e) {
    next(e);
  }
};

module.exports = {
  klusterWebhook,
  messageWebhookTest,
  triviaQuestions,
  triviaAnswer,
};
