"use client";

import { createContext, useContext } from "react";

export const COMMENT_CURSOR = 'url("/comment-cursor.svg") 2 2, pointer';
export const OlaModeContext = createContext(false);
export function useOlaMode() { return useContext(OlaModeContext); }
