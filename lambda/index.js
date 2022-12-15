/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');
var persistenceAdapter = getPersistenceAdapter();

// Dependencias i18n para la localización
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');

const GIVEN_NAME_PERMISSION = ['alexa::profile:given_name:read'];

const languageStrings = {
    en: {
        translation: {
            WELCOME_MESSAGE: "Welcome to unit conversion {{username}}, let's begin.",
            ANSWER_PREFIX: "You've answered {{answerNumber}} {{answerUnits}}.",
            CORRECT_ANSWER: "Correct.",
            INCORRECT_ANSWER: "Incorrect.",
            ANSWER_REVEAL: "1 {{questionUnit}} is {{answerNumber}} {{answerUnits}}.",
            CONTINUE_PROMPT: "Continue?",
            REPEATING_QUESTION: "I'll repeat the question for you.",
            QUESTION_SAVED: "Let's save this question for later.",
            MAX_PENDING: "You've reached the maximum of pending questions, let's repeat the one you saved.",
            ALL_QUESTIONS_ANSWERED: "You've already answered all the questions!",
            CORRECTLY_ANSWERED_INFO: "You've correctly answered {{correctCount}} out of {{questionCount}} questions. Last time you correctly answered {{lastCorrectCount}}",
            NO_NEW_QUESTIONS: "There are no more new questions, but you have one pending. Let's answer it.",
            NO_PENDING_QUESTIONS: "You don't have any pending questions. Do you want to continue with another one?",
            ADD_PENDING_QUESTION: "We left this question without an answer, I will be storing it for later.",
            PENDING_INTRO: "Let's answer the pending question.",
            HELP_MESSAGE: "To play this game, you must simply answer the questions and convert the units correctly.",
            GOODBYE_MESSAGE: "Thank you for playing! See you later.",
            ERROR_MESSAGE: "Ha ocurrido un error."
        }
    },
    es: {
        translation: {
            WELCOME_MESSAGE: "Bienvenido a conversión de unidades {{username}}, empezemos.",
            ANSWER_PREFIX: "Has respondido {{answerNumber}} {{answerUnits}}.",
            CORRECT_ANSWER: "Correcto.",
            INCORRECT_ANSWER: "Incorrecto.",
            ANSWER_REVEAL: "1 {{questionUnit}} son {{answerNumber}} {{answerUnits}}.",
            CONTINUE_PROMPT: "Continuamos?",
            REPEATING_QUESTION: "Repetiré la pregunta.",
            QUESTION_SAVED: "Guardamos esta pregunta para después, vamos con la siguiente!",
            MAX_PENDING: "Has alcanzado el máximo de preguntas pendientes, vamos a repetir la que ya has guardado.",
            ALL_QUESTIONS_ANSWERED: "Has respondido correctamente todas las preguntas!",
            CORRECTLY_ANSWERED_INFO: "Has acertado {{correctCount}} de {{questionCount}} preguntas. La última vez contestaste correctamente {{lastCorrectCount}}",
            ADD_PENDING_QUESTION: "Hemos dejado esta pregunta sin responder, la guardaremos para más tarde.",
            PENDING_INTRO: "Contestemos la pregunta que tenemos pendiente.",
            NO_NEW_QUESTIONS: "Ya no te quedan más preguntas nuevas, pero sí te queda una pendiente. Vamos a por ella.",
            NO_PENDING_QUESTIONS: "No te quedan más preguntas pendientes. Quieres continuar con otra?",
            HELP_MESSAGE: "Para jugar a este juego, simplemente debes contestar a las preguntas y convertir las unidades correctamente.",
            GOODBYE_MESSAGE: "¡Gracias por jugar! Hasta luego.",
            ERROR_MESSAGE: "An error has occurred."
        }
    }
}

// Variables para el juego
var questionlist = require('./question-list'); //ruta a las preguntas
var currentIndex = null;
var currentStatus = 'Question';
var count = 0;
var hits = 0;
var pending = null;

function getPersistenceAdapter() {
    // This function is an indirect way to detect if this is part of an Alexa-Hosted skill
    function isAlexaHosted() {
        return process.env.S3_PERSISTENCE_BUCKET;
    }
    const tableName = 'happy_birthday_table';
    if(isAlexaHosted()) {
        const {S3PersistenceAdapter} = require('ask-sdk-s3-persistence-adapter');
        return new S3PersistenceAdapter({ 
            bucketName: process.env.S3_PERSISTENCE_BUCKET
        });
    } else {
        // IMPORTANT: don't forget to give DynamoDB access to the role you're to run this lambda (IAM)
        const {DynamoDbPersistenceAdapter} = require('ask-sdk-dynamodb-persistence-adapter');
        return new DynamoDbPersistenceAdapter({ 
            tableName: tableName,
            createTable: true
        });
    }
}

// Función para seleccionar aleatoriamente un elemento de un array.
function getRandomItem (obj, locale) {
 if (Object.keys(obj[locale]).length === 0) {
    return null;
 }
 
 currentIndex = obj[locale][Object.keys(obj[locale])[Math.floor(Math.random()*Object.keys(obj[locale]).length)]];
 return currentIndex;
}

function getQuestion(random = true, locale, requestAttributes, sessionAttributes) {
    let speechText = '';
    if (random) {
        speechText = getRandomItem(questionlist, locale);
        if (currentIndex === null && pending === null) {
            const lastCount = sessionAttributes['lastCorrectCount']
            sessionAttributes['lastCorrectCount'] = hits
            return requestAttributes.t('CORRECTLY_ANSWERED_INFO', { correctCount: hits, questionCount: count, lastCorrectCount: lastCount })
        } 
        else if (currentIndex === null) {
            return requestAttributes.t('NO_NEW_QUESTIONS') + " " + pending.question
        }
        delete questionlist[locale][currentIndex.id];
        count++;
    } else {
        speechText = currentIndex;
    }
    const speakOutput = speechText.question;
    return speakOutput;
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        
        // Reseteamos estado
        questionlist = require('./question-list'); //ruta a las preguntas
        currentIndex = null;
        currentStatus = 'Question';
        count = 0;
        hits = 0;
        pending = null;

        const locale = handlerInput.requestEnvelope.request.locale
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const questionText = getQuestion(true, locale, requestAttributes, sessionAttributes); //AÑADIMOS LA PREGUNTA
        
        // API de ASK para obtener el nombre del usuario que ejecuta la skill
        if(!sessionAttributes['name']){
            // let's try to get the given name via the Customer Profile API
            // don't forget to enable this permission in your skill configuratiuon (Build tab -> Permissions)
            // or you'll get a SessionEnndedRequest with an ERROR of type INVALID_RESPONSE
            try {
                const {permissions} = requestEnvelope.context.System.user;
                if(!permissions)
                    throw { statusCode: 401, message: 'No permissions available' }; // there are zero permissions, no point in intializing the API
                const upsServiceClient = serviceClientFactory.getUpsServiceClient();
                const profileName = await upsServiceClient.getProfileGivenName();
                if (profileName) { // the user might not have set the name
                  //save to session and persisten attributes
                  sessionAttributes['name'] = profileName;
                }

            } catch (error) {
                console.log(JSON.stringify(error));
                if (error.statusCode === 401 || error.statusCode === 403) {
                    // the user needs to enable the permissions for given name, let's send a silent permissions card.
                  handlerInput.responseBuilder.withAskForPermissionsConsentCard(GIVEN_NAME_PERMISSION);
                }
            }
        }
        
        
        let name = sessionAttributes['name']
        let speakOutput = requestAttributes.t('WELCOME_MESSAGE', { username: name }) + " " + questionText;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const AnswerIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return (request.type === 'IntentRequest'
            && request.intent.name === 'AnswerIntent');
    },
    handle(handlerInput) {
        const AnswerValueNumber = handlerInput.requestEnvelope.request.intent.slots.numberSlot.value;
        const AnswerValueUnit = handlerInput.requestEnvelope.request.intent.slots.unitSlotSecond.value;
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const locale = handlerInput.requestEnvelope.request.locale
        
        // Dependiendo de si estamos respondiendo preguntas pendientes o no, construimos la respueta
        let questionUnit = ""
        let correctAnswerValue = 0
        let correctAnswerUnit = ""
        let correct = false;
        
        if(currentIndex === null) {
            // caso de pregunta pendiente
            questionUnit = pending.unitQuestion
            correctAnswerValue = pending.value
            correctAnswerUnit = pending.unitAnswer
            
            pending = null;
        } else {
            // caso de pregunta normal
            questionUnit = currentIndex.unitQuestion
            correctAnswerValue = currentIndex.value
            correctAnswerUnit = currentIndex.unitAnswer
            
            currentIndex = null;
        }
        
        // comprobamos si es correcta
        if(AnswerValueNumber === correctAnswerValue && AnswerValueUnit === correctAnswerUnit) {
            correct = true
            hits++;
        }
        
        // revelamos al usuario la respuesta correcta
        let answerReveal = requestAttributes.t('ANSWER_REVEAL', { questionUnit: questionUnit, answerNumber: correctAnswerValue, answerUnits: correctAnswerUnit })
        let speakOutput = requestAttributes.t('ANSWER_PREFIX', { answerNumber: AnswerValueNumber, answerUnits: AnswerValueUnit });
        
        if(correct)
          speakOutput += " " + requestAttributes.t('CORRECT_ANSWER')
        else
          speakOutput += " " + requestAttributes.t('INCORRECT_ANSWER')
          
        speakOutput += " " + answerReveal + " " + requestAttributes.t('CONTINUE_PROMPT')
        currentIndex = null;
        currentStatus = 'Continue';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const YesIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && request.intent.name === 'AMAZON.YesIntent';
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const locale = handlerInput.requestEnvelope.request.locale
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const speakOutput = getQuestion(true, locale, requestAttributes, sessionAttributes);
        currentStatus = 'Question';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const RepeatIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope;
        return Alexa.getRequestType(request) === 'IntentRequest'
            && Alexa.getIntentName(request) === 'AMAZON.RepeatIntent';
    },
    handle(handlerInput) {
        const locale = handlerInput.requestEnvelope.request.locale
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        
        // Si estamos en modo pregunta la repetiremos, en otro caso, preguntamos al usuario si quiere continuar
        let speakOutput = "";
        if (currentStatus === 'Question') {
            speakOutput = requestAttributes.t('REPEATING_QUESTION') + getQuestion(false, locale, requestAttributes, sessionAttributes);
        } else if (currentStatus === 'Continue') {
            speakOutput = requestAttributes.t('CONTINUE_PROMPT')
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const NextIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope;
        return Alexa.getRequestType(request) === 'IntentRequest'
            && Alexa.getIntentName(request) === 'AMAZON.NextIntent';
    },
    handle(handlerInput) {
        const locale = handlerInput.requestEnvelope.request.locale
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        
        let speakOutput = '';
        if (pending !== null) {
            speakOutput = requestAttributes.t('MAX_PENDING')
            const tmpIndex = pending;
            currentIndex = pending;
            pending = tmpIndex;
            speakOutput += " " + getQuestion(false, locale, requestAttributes, sessionAttributes);
        }
        else {
            speakOutput = requestAttributes.t('QUESTION_SAVED')
            pending = currentIndex;
            speakOutput += " " + getQuestion(true, locale, requestAttributes, sessionAttributes);
        }
        
        currentStatus = 'Question';
    
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const PendingIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope;
        return Alexa.getRequestType(request) === 'IntentRequest'
            && Alexa.getIntentName(request) === 'PendingIntent';
    },
    handle(handlerInput) {
        const locale = handlerInput.requestEnvelope.request.locale
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const {attributesManager, serviceClientFactory, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        
        let speakOutput = '';
        if (pending === null) {
            if (currentIndex !== null && currentStatus === 'Question') {
                speakOutput += requestAttributes.t('QUESTION_SAVED')
                pending = currentIndex;
            }
            speakOutput += " " + requestAttributes.t('NO_PENDING_QUESTIONS')
            currentStatus = 'Continue';
        }
        else {
            if (currentIndex !== null && currentStatus === 'Question') {
                let tmpIndex = currentIndex;
                currentIndex = pending;
                pending = currentIndex;
                speakOutput += requestAttributes.t('QUESTION_SAVED')
            }
            else {
                currentIndex = pending;
                pending = null;
            }
            
            speakOutput += " " + requestAttributes.t('PENDING_INTRO') + getQuestion(false, locale, requestAttributes, sessionAttributes);
            currentStatus = 'Question';
        }
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
    },
};

const ExitIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest'
            && (request.intent.name === 'AMAZON.CancelIntent'
                || request.intent.name === 'ExitIntent'
                || request.intent.name === 'AMAZON.NoIntent'
                || request.intent.name === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const locale = handlerInput.requestEnvelope.request.locale
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const goodbye_message = requestAttributes.t('GOODBYE_MESSAGE')
        let speakOutput = goodbye_message
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speakOutput = requestAttributes.t('HELP_MESSAGE');
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
        const speakOutput = requestAttributes.t('ERROR_MESSAGE');
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// This request interceptor will log all incoming requests to this lambda
const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log(`Incoming request: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);
    }
};

// This response interceptor will log all outgoing responses of this lambda
const LoggingResponseInterceptor = {
    process(handlerInput, response) {
      console.log(`Outgoing response: ${JSON.stringify(response)}`);
    }
};

// This request interceptor will bind a translation function 't' to the requestAttributes.
const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      fallbackLng: 'en',
      overloadTranslationOptionHandler: sprintf.overloadTranslationOptionHandler,
      resources: languageStrings,
      returnObjects: true
    });

    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function (...args) {
      return localizationClient.t(...args);
    }
  }
}

const LoadAttributesRequestInterceptor = {
    async process(handlerInput) {
        if(handlerInput.requestEnvelope.session['new']){ //is this a new session?
            const {attributesManager} = handlerInput;
            const persistentAttributes = await attributesManager.getPersistentAttributes() || {};
            //copy persistent attribute to session attributes
            handlerInput.attributesManager.setSessionAttributes(persistentAttributes);
        }
    }
};

const SaveAttributesResponseInterceptor = {
    async process(handlerInput, response) {
        const {attributesManager} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const shouldEndSession = (typeof response.shouldEndSession === "undefined" ? true : response.shouldEndSession);//is this a session end?
        if(shouldEndSession || handlerInput.requestEnvelope.request.type === 'SessionEndedRequest') { // skill was stopped or timed out            
            attributesManager.setPersistentAttributes(sessionAttributes);
            await attributesManager.savePersistentAttributes();
        }
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        HelpIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        AnswerIntentHandler,
        YesIntentHandler,
        ExitIntentHandler,
        NextIntentHandler,
        RepeatIntentHandler,
        PendingIntentHandler)
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(
        LoggingRequestInterceptor, 
        LocalizationInterceptor, 
        LoadAttributesRequestInterceptor)
    .addResponseInterceptors(
        LoggingResponseInterceptor, 
        SaveAttributesResponseInterceptor)
    .withPersistenceAdapter(persistenceAdapter)
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();