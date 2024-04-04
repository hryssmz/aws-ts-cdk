import { useLayoutEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { paths } from "../lib";
import { useDispatch, useSelector } from "../store";
import { getCurrentUser, selectUser } from "../store/auth";

export default function Layout() {
  const user = useSelector(selectUser);
  const dispatch = useDispatch();

  useLayoutEffect(() => {
    dispatch(getCurrentUser()).unwrap();
  }, [dispatch]);

  return (
    <div className="grid grid-cols-12">
      <nav className="m-2 col-span-3">
        <div>
          <Link to={paths.home}>Home</Link>
        </div>
        {user ? (
          <>
            <div>
              <Link to={paths.updateMfa}>Update MFA</Link>
            </div>
            <div>
              <Link to={paths.signout}>Sign Out</Link>
            </div>
          </>
        ) : (
          <>
            <div>
              <Link to={paths.signup}>Sign Up</Link>
            </div>
            <div>
              <Link to={paths.signin}>Sign In</Link>
            </div>
          </>
        )}
      </nav>
      <main className="col-span-9">
        <Outlet />
      </main>
    </div>
  );
}
