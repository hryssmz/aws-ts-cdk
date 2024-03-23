import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import authReducer from "./auth";
import type { TypedUseSelectorHook } from "react-redux";

const store = configureStore({
  reducer: { auth: authReducer },
});

export default store;
export type State = ReturnType<typeof store.getState>;
export type Dispatch = typeof store.dispatch;

const useDispatchTyped: () => Dispatch = useDispatch;
const useSelectorTyped: TypedUseSelectorHook<State> = useSelector;

export { useDispatchTyped as useDispatch, useSelectorTyped as useSelector };
