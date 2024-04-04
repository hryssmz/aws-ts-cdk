import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { confirmSignIn } from "aws-amplify/auth";
import QRCode from "react-qr-code";
import { defaultValues, paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

type LocationState =
  | { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" }
  | { signInStep: "CONFIRM_SIGN_IN_WITH_SMS_CODE" }
  | { signInStep: "CONFIRM_SIGN_IN_WITH_TOTP_CODE" }
  | { signInStep: "CONTINUE_SIGN_IN_WITH_MFA_SELECTION" }
  | {
      signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE";
      additionalInfo: { type: string };
    }
  | { signInStep: "CONTINUE_SIGN_IN_WITH_TOTP_SETUP"; setupUri: string };

export default function ConfirmSignIn() {
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const state: LocationState = location.state;
  const { signInStep } = state;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const formData = new FormData(event.target as HTMLFormElement);
      const data = [...formData].reduce((acc, [k, v]) => {
        return { ...acc, [k]: typeof v === "string" ? v : v.name };
      }, {} as Record<string, string>);
      const { answer, mfa, password, smscode, totpcode } = data;
      const { isSignedIn, nextStep } = await confirmSignIn({
        challengeResponse:
          signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
            ? password
            : signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE"
            ? smscode
            : signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE" ||
              signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP"
            ? totpcode
            : signInStep === "CONTINUE_SIGN_IN_WITH_MFA_SELECTION"
            ? mfa
            : signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE"
            ? answer
            : "",
      }).catch(error => {
        alert(error);
        throw error;
      });
      if (isSignedIn) {
        await dispatch(getCurrentUser()).unwrap();
        navigate(paths.home);
      } else {
        switch (nextStep.signInStep) {
          case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
          case "CONFIRM_SIGN_IN_WITH_TOTP_CODE": {
            navigate(paths.confirmSignin, {
              state: { signInStep: nextStep.signInStep },
            });
            break;
          }
          case "CONTINUE_SIGN_IN_WITH_TOTP_SETUP": {
            const setupUri = nextStep.totpSetupDetails
              .getSetupUri("testApp")
              .toString();
            navigate(paths.confirmSignin, {
              state: { signInStep: nextStep.signInStep, setupUri },
            });
            break;
          }
          default: {
            alert(JSON.stringify(nextStep, null, 2));
          }
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2>Confirm Sign In</h2>
      <form onSubmit={handleSubmit} autoComplete="off">
        {signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" ? (
          <label className="mb-1 block">
            Password:{" "}
            <input
              name="password"
              type="text"
              required
              defaultValue={defaultValues.password}
            />
          </label>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE" ? (
          <label className="mb-1 block">
            SMS code: <input name="smscode" type="text" required />
          </label>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE" ? (
          <label className="mb-1 block">
            TOTP code: <input name="totpcode" type="text" required />
          </label>
        ) : signInStep === "CONTINUE_SIGN_IN_WITH_MFA_SELECTION" ? (
          <>
            <label className="mb-1 block">
              <input name="mfa" type="radio" value="SMS" required /> SMS
            </label>
            <label className="mb-1 block">
              <input name="mfa" type="radio" value="TOTP" required /> TOTP
            </label>
          </>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" ? (
          <label className="mb-1 block">
            {state.additionalInfo.type === "EMAIL"
              ? "Verification Code: "
              : "Challenge Answer: "}
            <input name="answer" type="text" required />
          </label>
        ) : signInStep === "CONTINUE_SIGN_IN_WITH_TOTP_SETUP" ? (
          <>
            <label className="mb-1 block">
              TOTP Code: <input name="totpcode" type="text" required />
            </label>
            <QRCode className="mb-1 block" value={state.setupUri} size={256} />
          </>
        ) : null}
        <div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
