import express from "express";
const app=express();
app.use(express.json());
app.use(express.static("public"));
const port=process.env.PORT || 3000;
app.get("/health",(_,res)=>res.json({ok:true}));
app.listen(port,"0.0.0.0",()=>console.log(`Ficha Técnica Rafael Vidal: ${port}`));
