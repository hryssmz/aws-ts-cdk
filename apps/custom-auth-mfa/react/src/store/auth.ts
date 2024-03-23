import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as amplifyAuth from "aws-amplify/auth";
import type { AuthUser } from "aws-amplify/auth";
import type { State } from ".";

export interface AuthState {
  user?: AuthUser;
}

const initialState: AuthState = { user: undefined };

export const getCurrentUser = createAsyncThunk(
  "auth/getCurrentUser",
  async () => {
    const user = await amplifyAuth.getCurrentUser().catch((error: Error) => {
      switch (error.name) {
        case "UserUnAuthenticatedException": {
          return undefined;
        }
        default: {
          console.error(error);
          throw error;
        }
      }
    });
    return user;
  }
);

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
  },
  extraReducers(builder) {
    builder.addCase(getCurrentUser.fulfilled, (state, action) => {
      state.user = action.payload;
    });
  },
});

export default authSlice.reducer;
export const { setUser } = authSlice.actions;

export const selectUser = (state: State) => state.auth.user;
