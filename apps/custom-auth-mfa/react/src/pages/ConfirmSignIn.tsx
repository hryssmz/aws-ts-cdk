import { useLocation, useNavigate } from "react-router-dom";
import { confirmSignIn } from "aws-amplify/auth";
import { defaultValues, paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

interface LocationState {
  signInStep:
    | "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
    | "CONFIRM_SIGN_IN_WITH_SMS_CODE"
    | "CONFIRM_SIGN_IN_WITH_TOTP_CODE"
    | "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE";
  additionalInfo?: { type: "EMAIL" };
}

export default function ConfirmSignIn() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { signInStep, additionalInfo }: LocationState = location.state;

  return (
    <div>
      <h2>Confirm Sign In</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const formData = new FormData(event.target as HTMLFormElement);
          const data = [...formData].reduce((acc, [k, v]) => {
            return { ...acc, [k]: typeof v === "string" ? v : v.name };
          }, {} as Record<string, string>);
          const { challengeanswer, password, smscode, totpcode } = data;
          const { isSignedIn, nextStep } = await confirmSignIn({
            challengeResponse:
              signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
                ? password
                : signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE"
                ? smscode
                : signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE"
                ? totpcode
                : signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE"
                ? challengeanswer
                : "",
          }).catch(error => {
            alert(error);
            throw error;
          });
          if (isSignedIn) {
            await dispatch(getCurrentUser()).unwrap();
            navigate(paths.home);
          } else {
            alert(JSON.stringify(nextStep, null, 2));
          }
        }}
        autoComplete="off"
      >
        {signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" ? (
          <div className="mb-1">
            <label htmlFor="confirm-signin-password">Password: </label>
            <input
              id="confirm-signin-password"
              name="password"
              type="text"
              required
              defaultValue={defaultValues.password}
            />
          </div>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_SMS_CODE" ? (
          <div className="mb-1">
            <label htmlFor="confirm-signin-sms-code">SMS code: </label>
            <input
              id="confirm-signin-sms-code"
              name="smscode"
              type="text"
              required
            />
          </div>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_TOTP_CODE" ? (
          <div className="mb-1">
            <label htmlFor="confirm-signin-totp-code">TOTP code: </label>
            <input
              id="confirm-signin-totp-code"
              name="totpcode"
              type="text"
              required
            />
          </div>
        ) : signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" &&
          additionalInfo ? (
          <div className="mb-1">
            <label htmlFor="confirm-signin-challenge-answer">
              {additionalInfo.type === "EMAIL" ? "Verification Code: " : null}
            </label>
            <input
              id="confirm-signin-challenge-answer"
              name="challengeanswer"
              type="text"
              required
            />
          </div>
        ) : null}
        <div>
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
  );
}
