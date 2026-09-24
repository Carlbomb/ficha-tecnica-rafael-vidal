import { Stack } from "expo-router";
import { useEffect } from "react";
import { initDatabase } from "../src/db";
export default function Layout(){useEffect(()=>{initDatabase();},[]);return <Stack screenOptions={{headerTitle:"MISEVO"}}/>;}
