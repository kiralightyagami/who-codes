import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();


const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});


const interaction = await ai.interactions.create({
  model: "gemini-3.7-flash",
  input: "what's your name",
  system_instruction: "You are an ai agent name friday",
});

console.log(interaction.output_text);