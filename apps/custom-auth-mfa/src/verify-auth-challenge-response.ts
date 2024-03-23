import type { VerifyAuthChallengeResponseTriggerEvent } from "aws-lambda";

export const handler = async (
  event: VerifyAuthChallengeResponseTriggerEvent
) => {
  console.log(JSON.stringify(event, null, 2));
  const { request, response } = event;
  const { challengeAnswer, privateChallengeParameters } = request;
  response.answerCorrect =
    challengeAnswer === privateChallengeParameters.answer;
  return event;
};
