import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "aws-amplify/auth";
import { paths } from "../lib";
import { useDispatch } from "../store";
import { setUser } from "../store/auth";

export default function SignOut() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  useEffect(() => {
    signOut().then(() => {
      dispatch(setUser(undefined));
      navigate(paths.home);
    });
  }, [dispatch, navigate]);

  return (
    <div>
      <h2>Sign Out</h2>
      <div>Signing out...</div>
    </div>
  );
}
