import { useNavigate } from "react-router-dom";
import { resendSignUpCode, signIn } from "aws-amplify/auth";
import { authFlowType, defaultValues, paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

export default function SignIn() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  return (
    <div>
      <h2>Sign In</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const formData = new FormData(event.target as HTMLFormElement);
          const data = [...formData].reduce((acc, [k, v]) => {
            return { ...acc, [k]: typeof v === "string" ? v : v.name };
          }, {} as Record<string, string>);
          const { username, password } = data;
          const { isSignedIn, nextStep } = await signIn({
            username,
            password,
            options: { authFlowType },
          }).catch(error => {
            alert(error);
            throw error;
          });
          if (isSignedIn) {
            await dispatch(getCurrentUser()).unwrap();
            navigate(paths.home);
          } else {
            switch (nextStep.signInStep) {
              case "CONFIRM_SIGN_UP": {
                navigate(paths.confirmSignup, {
                  state: { previous: "signIn" },
                });
                const result = await resendSignUpCode({ username });
                alert(JSON.stringify(result, null, 2));
                break;
              }
              case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
              case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
              case "CONFIRM_SIGN_IN_WITH_TOTP_CODE": {
                navigate(paths.confirmSignin, {
                  state: { signInStep: nextStep.signInStep },
                });
                break;
              }
              case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
                navigate(paths.confirmSignin, {
                  state: {
                    signInStep: nextStep.signInStep,
                    additionalInfo: nextStep.additionalInfo,
                  },
                });
                break;
              default: {
                alert(JSON.stringify(nextStep, null, 2));
              }
            }
          }
        }}
      >
        <div className="my-1">
          <label htmlFor="signin-username">Username: </label>
          <input
            id="signin-username"
            name="username"
            type="text"
            required
            defaultValue={defaultValues.username}
          />
        </div>
        <div className="my-1">
          <label htmlFor="signin-password">Password: </label>
          <input
            id="signin-password"
            name="password"
            type="text"
            required
            defaultValue={defaultValues.password}
          />
        </div>
        <div>
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
  );
}
