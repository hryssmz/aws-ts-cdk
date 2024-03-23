import type { DefineAuthChallengeTriggerEvent } from "aws-lambda";

const mfaHandler = async (event: DefineAuthChallengeTriggerEvent) => {
  const { request, response } = event;
  const { userAttributes } = request;
  const mfa = userAttributes["custom:mfa"];
  if (mfa === "SMS") {
    response.challengeName = "SMS_MFA";
  } else if (mfa === "TOTP") {
    response.challengeName = "SOFTWARE_TOKEN_MFA";
  } else if (mfa === "EMAIL") {
    response.challengeName = "CUSTOM_CHALLENGE";
  } else {
    response.failAuthentication = true;
  }
  return event;
};

export const handler = async (event: DefineAuthChallengeTriggerEvent) => {
  console.log(JSON.stringify(event, null, 2));
  const { request, response } = event;
  const { session } = request;
  response.issueTokens = false;
  response.failAuthentication = false;

  const challengeStep =
    session.length === 1 && session[0].challengeName === "SRP_A"
      ? 1
      : session.length === 2 &&
        session[1].challengeName === "PASSWORD_VERIFIER" &&
        session[1].challengeResult === true
      ? 2
      : session.length === 3
      ? 3
      : -1;

  if (challengeStep === 1) {
    response.challengeName = "PASSWORD_VERIFIER";
  } else if (challengeStep === 2) {
    return mfaHandler(event);
  } else if (challengeStep === 3) {
    response.issueTokens = true;
  } else {
    response.failAuthentication = true;
  }
  return event;
};
