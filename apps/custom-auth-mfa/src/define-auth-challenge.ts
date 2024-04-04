import type { DefineAuthChallengeTriggerEvent } from "aws-lambda";

const mfaHandler = async (event: DefineAuthChallengeTriggerEvent) => {
  const { request, response } = event;
  const { userAttributes } = request;
  const mfa = userAttributes["custom:mfa"];
  if (mfa === "SMS") {
    console.log("SMS_MFA");
    response.challengeName = "SMS_MFA";
  } else if (mfa === "TOTP") {
    console.log("SOFTWARE_TOKEN_MFA");
    response.challengeName = "SOFTWARE_TOKEN_MFA";
  } else if (mfa === "EMAIL") {
    console.log("CUSTOM_CHALLENGE");
    response.challengeName = "CUSTOM_CHALLENGE";
  } else if (!mfa || mfa === "OFF") {
    console.log("DONE");
    response.issueTokens = true;
  } else {
    console.log("FAILED");
    response.failAuthentication = true;
  }
  return event;
};

export const handler = async (event: DefineAuthChallengeTriggerEvent) => {
  console.log(JSON.stringify(event, null, 2));
  const { request, response } = event;
  const { session } = request;
  const { challengeName, challengeResult } = session[session.length - 1];
  response.issueTokens = false;
  response.failAuthentication = false;

  if (challengeName === "SRP_A") {
    console.log("PASSWORD_VERIFIER");
    response.challengeName = "PASSWORD_VERIFIER";
  } else if (challengeResult === true) {
    const challenges = ["SMS_MFA", "SOFTWARE_TOKEN_MFA", "CUSTOM_CHALLENGE"];
    if (challenges.indexOf(session[session.length - 1].challengeName) >= 0) {
      console.log("DONE");
      response.issueTokens = true;
    } else {
      return mfaHandler(event);
    }
  } else {
    console.log("FAILED");
    response.failAuthentication = true;
  }
  return event;
};
