import { useNavigate } from "react-router-dom";
import {
  signOut,
  updateMFAPreference,
  updateUserAttribute,
} from "aws-amplify/auth";
import { paths } from "../lib";
import { useDispatch } from "../store";
import { setUser } from "../store/auth";

export default function MfaEmail() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  return (
    <div>
      <h2>MFA Email</h2>
      <form
        onSubmit={async event => {
          event.preventDefault();
          await updateMFAPreference({ sms: "DISABLED", totp: "DISABLED" });
          await updateUserAttribute({
            userAttribute: { attributeKey: "custom:mfa", value: "EMAIL" },
          });
          await signOut();
          dispatch(setUser(undefined));
          navigate(paths.signin);
        }}
      >
        <div>
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
  );
}
