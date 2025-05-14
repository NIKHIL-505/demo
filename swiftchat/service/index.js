/* eslint-disable no-useless-catch */
/* eslint-disable no-fallthrough */
/* eslint-disable arrow-parens */

const { v4: uuidv4 } = require('uuid');
const model = require('../../model');
const logger = require('../../utils/logger');
const strings = require('../strings');
const { botConfig } = require('../../config');
const { Text } = require('../../utils/message-types');
const registrationService = require('../../registration/service');
const PersistentMenuService = require('../../persistent-menu/services');
const { insertRegisteredUser} = require('../../utils/stats-api');
const {
  invalidWebMessageButtons, invalidWebViewMoreMessageButtons,
} = require('../../utils/message-samples');
const { getUserMessage } = require('../../utils/swiftchat-helpers');
const fetch = require('node-fetch'); // Add at the top if not present

const klusterWebhook = async (userMobile, userMessage, messageType, messageBody) => {
  const waNumber = null;
  const responseMessage = [];
  try {
    let userContext = await model.getUserContext(userMobile);
    let userMedium;
    if (userContext === null) {
      insertRegisteredUser(userMobile);
      userContext = { stepName: 'entryPoint', stepData: {} };
      userMedium = botConfig.medium;
    } else if (!userContext.userMedium) {
      userMedium = botConfig.medium;
    } else {
      userMedium = userContext.userMedium;
    }
    logger.debug(
      `SwiftChat Message Received - From: ${userMobile}, Message: ${userMessage}`
    );
    if (messageType === null) {
      responseMessage.push(new Text(strings[userMedium].typeExceptionMessage));
      model.sendMessage(waNumber, userMobile, responseMessage).catch((err) =>
        logger.error('Send Message Failure ', {
          waNumber,
          userMobile,
          responseMessage,
          err: model.constructError(err),
        })
      );
      return;
    }
    const lockId = uuidv4();
    const isLockAvailable = await model.getMessageLock(userMobile, lockId);
    if (!isLockAvailable) {
      logger.info({ userMobile, message: 'SwiftChat Message Rejected' });
      responseMessage.push(new Text(strings[userMedium].redisLockMessage));
      model.sendMessage(waNumber, userMobile, responseMessage).catch((err) =>
        logger.error('Send Message Failure ', {
          waNumber,
          userMobile,
          responseMessage,
          err: model.constructError(err),
        })
      );
      return;
    }

    const isUserValidationLocked = await model.isUserValidationLocked(userMobile);
    if (isUserValidationLocked) {
      let response = []
      logger.info({ userMobile, message: 'Message Rejected (Pending Response for previous query)' });
      await model.releaseMessageLock(userMobile, lockId);
      response.push(new Text(strings[userMedium].userValidationLockMessage));
      model.sendMessage(waNumber, userMobile, response).catch(err => logger.error('Send Message Failure ', {
        waNumber, userMobile, responseMessage, err: model.constructError(err),
      }));
      return;
    }

    if (userMessage === 'user reset') {
      await model.updateUserContext(userMobile, {
        stepName: 'entryPoint',
        stepData: {},
      });
      await model.releaseMessageLock(userMobile, lockId);
      responseMessage.push(new Text(strings[userMedium].unregisterMessage));
      model.sendMessage(waNumber, userMobile, responseMessage).catch((err) =>
        logger.error('Send Message Failure ', {
          waNumber,
          userMobile,
          responseMessage,
          err: model.constructError(err),
        })
      );
      return;
    }
    let isPersistentMenu = messageType === 'persistent_menu_response';
    if (userContext.stepName === 'entryPoint' && isPersistentMenu) {
      isPersistentMenu = false;
    }
    if (isPersistentMenu) {
      await PersistentMenuService.processMessage(
        waNumber,
        userMobile,
        userMessage,
        userContext,
        userMedium
      );
      return await model.releaseMessageLock(userMobile, lockId);
    }

    if (userContext.stepName === 'awaitViewMessageTypes' && !userContext.stepData.firstTime) {
      userMessage = await getUserMessage(messageType, messageBody, [...invalidWebMessageButtons, ...invalidWebViewMoreMessageButtons]);
    }
    
    switch (userContext.stepName) {
      case 'entryPoint':
      case 'awaitMedium':
      case 'awaitNext':
      case 'awaitName':
      case 'awaitViewMessageTypes':
        await registrationService.processMessage(
          waNumber,
          userMobile,
          userMessage,
          userContext,
          userMedium,
        );
        break;
      default: break;
    }
    return await model.releaseMessageLock(userMobile, lockId);
  } catch (e) {
    throw e;
  }
};

async function fetchTriviaQuestions(category, difficulty) {
  const url = `https://opentdb.com/api.php?amount=10&category=${category}&difficulty=${difficulty}`;
  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error('Failed to fetch trivia questions');
  const data = await response.json();
  return data.results;
}

module.exports = {
  klusterWebhook,
  fetchTriviaQuestions, // Add this to exports
};
