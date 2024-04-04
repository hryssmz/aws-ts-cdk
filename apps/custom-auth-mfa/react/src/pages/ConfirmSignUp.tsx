import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { autoSignIn, confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

interface LocationState {
  username: string;
  previous: typeof paths.signin | typeof paths.signup;
}

export default function ConfirmSignUp() {
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { username, previous }: LocationState = location.state;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      const formData = new FormData(event.target as HTMLFormElement);
      const data = [...formData].reduce((acc, [k, v]) => {
        return { ...acc, [k]: typeof v === "string" ? v : v.name };
      }, {} as Record<string, string>);
      const { code } = data;
      const { isSignUpComplete, nextStep } = await confirmSignUp({
        username,
        confirmationCode: code,
      }).catch(error => {
        alert(error);
        throw error;
      });
      if (isSignUpComplete) {
        if (previous === paths.signup) {
          const { isSignedIn, nextStep } = await autoSignIn().catch(error => {
            alert(error);
            throw error;
          });
          if (isSignedIn) {
            await dispatch(getCurrentUser()).unwrap();
            navigate(paths.home);
          } else {
            switch (nextStep.signInStep) {
              case "CONFIRM_SIGN_IN_WITH_SMS_CODE": {
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
        } else if (previous === paths.signin) {
          await dispatch(getCurrentUser()).unwrap();
          navigate(paths.home);
        }
      } else {
        alert(JSON.stringify(nextStep, null, 2));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    try {
      setResending(true);
      const result = await resendSignUpCode({ username });
      alert(JSON.stringify(result, null, 2));
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      <h2>Confirm Sign Up</h2>
      <div className="mb-1">Username: {username}</div>
      <form onSubmit={handleSubmit} autoComplete="off">
        <label className="mb-1 block">
          Code: <input name="code" type="text" required className="mr-1" />
          <button type="button" onClick={handleResend} disabled={resending}>
            {resending ? "Resending..." : "Resend"}
          </button>
        </label>
        <div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
