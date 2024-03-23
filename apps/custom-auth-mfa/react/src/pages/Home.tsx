import { useSelector } from "../store";
import { selectUser } from "../store/auth";

export default function Home() {
  const user = useSelector(selectUser);

  return (
    <div>
      <h2>Home</h2>
      <div>{user ? `Welcome, ${user.username}!` : "Hey, stranger!"}</div>
    </div>
  );
}
