import { Navigate, RouterProvider } from "react-router-dom";
import { createBrowserRouter } from "react-router-dom";
import { Provider as StoreProvider } from "react-redux";
import { paths } from "./lib";
import store from "./store";
import ConfirmSignIn from "./pages/ConfirmSignIn";
import ConfirmSignUp from "./pages/ConfirmSignUp";
import Home from "./pages/Home";
import Layout from "./pages/Layout";
import SignIn from "./pages/SignIn";
import SignOut from "./pages/SignOut";
import SignUp from "./pages/SignUp";
import UpdateMfa from "./pages/UpdateMfa";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: paths.home, element: <Home /> },
      { path: paths.confirmSignin, element: <ConfirmSignIn /> },
      { path: paths.confirmSignup, element: <ConfirmSignUp /> },
      { path: paths.signin, element: <SignIn /> },
      { path: paths.signup, element: <SignUp /> },
      { path: paths.signout, element: <SignOut /> },
      { path: paths.updateMfa, element: <UpdateMfa /> },
      { path: "*", element: <Navigate to={paths.home} /> },
    ],
  },
]);

export default function App() {
  return (
    <StoreProvider store={store}>
      <RouterProvider router={router} />
    </StoreProvider>
  );
}
