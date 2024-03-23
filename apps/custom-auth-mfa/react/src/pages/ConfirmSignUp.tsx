import { useLocation, useNavigate } from "react-router-dom";
import { autoSignIn, confirmSignUp, resendSignUpCode } from "aws-amplify/auth";
import { defaultValues, paths } from "../lib";
import { useDispatch } from "../store";
import { getCurrentUser } from "../store/auth";

interface LocationState {
  previous: "signIn" | "signUp";
}

export default function ConfirmSignUp() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { previous }: LocationState = location.state;

  return (
    <div>
      <h2>Confirm Sign Up</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          const formData = new FormData(event.target as HTMLFormElement);
          const data = [...formData].reduce((acc, [k, v]) => {
            return { ...acc, [k]: typeof v === "string" ? v : v.name };
          }, {} as Record<string, string>);
          const { username, code } = data;
          const { isSignUpComplete, nextStep } = await confirmSignUp({
            username,
            confirmationCode: code,
          }).catch(error => {
            alert(error);
            throw error;
          });
          if (isSignUpComplete) {
            if (previous === "signUp") {
              const { isSignedIn, nextStep } = await autoSignIn().catch(
                error => {
                  alert(error);
                  throw error;
                }
              );
              if (isSignedIn) {
                await dispatch(getCurrentUser()).unwrap();
                navigate(paths.home);
              } else {
                alert(JSON.stringify(nextStep, null, 2));
              }
            } else if (previous === "signIn") {
              await dispatch(getCurrentUser()).unwrap();
              navigate(paths.home);
            }
          } else {
            alert(JSON.stringify(nextStep, null, 2));
          }
        }}
      >
        <div className="mb-1">
          <label htmlFor="confirm-signup-username">Username: </label>
          <input
            id="confirm-signup-username"
            name="username"
            type="text"
            required
            defaultValue={defaultValues.username}
          />
        </div>
        <div className="mb-1">
          <label htmlFor="confirm-signup-code">Code: </label>
          <input id="confirm-signup-code" name="code" type="text" required />
        </div>
        <div>
          <button type="submit" className="mr-1">
            Submit
          </button>
          <button
            type="button"
            onClick={async () => {
              const usernameInput = document.getElementById(
                "confirm-signup-username"
              ) as HTMLInputElement;
              const username = usernameInput.value;
              const result = await resendSignUpCode({ username });
              alert(JSON.stringify(result, null, 2));
            }}
          >
            Resend
          </button>
        </div>
      </form>
    </div>
  );
}
