"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { calculateRoi, plans } from "@vowhumans/commercial-core";

type LeadKind = "demo" | "contact" | "partner" | "investor" | "trust" | "support";

const copy: Record<LeadKind,{title:string;summary:string;button:string}> = {
  demo:{title:"Book a VowHumans demonstration",summary:"Tell us what a useful, responsible digital employee would do in your organisation.",button:"Request demonstration"},
  contact:{title:"Talk to the VowHumans team",summary:"Share your commercial, technical or governance question.",button:"Send enquiry"},
  partner:{title:"Apply to become a VowHumans partner",summary:"Choose a technology, solution, referral, training or content partnership.",button:"Validate application"},
  investor:{title:"Contact investor relations",summary:"Request the approved company overview or begin a confidential conversation.",button:"Request investor contact"},
  trust:{title:"Request a trust document",summary:"Select the security, privacy or responsible-AI material required for your review.",button:"Validate request"},
  support:{title:"Contact VowHumans support",summary:"Describe the product area, impact and safe reproduction steps. Never include secrets.",button:"Validate support request"},
};

export function LeadForm({kind}:{kind:LeadKind}) {
  const [state,setState]=useState<"idle"|"sending"|"done"|"error">("idle");
  const [message,setMessage]=useState("");
  const content=copy[kind];
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setState("sending"); setMessage("");
    const form=event.currentTarget; const payload=Object.fromEntries(new FormData(form).entries());
    try { const response=await fetch(`/api/v1/${kind}-requests`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}); const result=await response.json() as {message?:string;detail?:string;persistent?:boolean}; if(!response.ok)throw new Error(result.detail??"Request could not be validated."); setState("done"); setMessage(result.message??(result.persistent?"Request received.":"Validated in safe preview. Connect the production API to persist and deliver it.")); form.reset(); }
    catch(error){setState("error");setMessage(error instanceof Error?error.message:"Request could not be validated.")}
  }
  return <div className="lead-layout"><section><p className="commercial-kicker"><span/>SAFE COMMERCIAL WORKFLOW</p><h1>{content.title}</h1><p>{content.summary}</p><div className="form-proof"><ShieldCheck size={20}/><span><b>No provider claims</b><small>The interface reports whether delivery is persistent.</small></span></div></section><form className="commercial-form" onSubmit={submit}><label>Work email<input required type="email" name="email" autoComplete="email" placeholder="name@company.com"/></label><label>Full name<input required name="name" autoComplete="name" minLength={2}/></label><label>Organisation<input required name="organisation" autoComplete="organization" minLength={2}/></label><label>What do you need?<textarea required name="message" rows={5} minLength={10} placeholder="Use case, people served, timing and any required systems."/></label><label className="check-label"><input required type="checkbox" name="consent" value="accepted"/><span>I agree that GoalVow may use these details to respond. I have not included sensitive information.</span></label><button className="public-button" disabled={state==="sending"}>{state==="sending"?<LoaderCircle className="spin" size={16}/>:null}{content.button}</button>{message?<p role="status" className={`form-status ${state}`}>{message}</p>:null}</form></div>;
}

const authCopy: Record<"signin"|"signup",{title:string;summary:string;button:string}> = {
  signin:{title:"Sign in to VowHumans",summary:"Sign in with your VowHumans account.",button:"Sign in"},
  signup:{title:"Register for VowHumans",summary:"Create a real GoalVow Platform account. Email verification isn't connected yet, so use a password you don't reuse elsewhere.",button:"Register"},
};

function AuthFormInner({kind}:{kind:"signin"|"signup"}) {
  const router=useRouter();
  const searchParams=useSearchParams();
  const [state,setState]=useState<"idle"|"sending"|"error">("idle");
  const [message,setMessage]=useState("");
  const content=authCopy[kind];
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); setState("sending"); setMessage("");
    const form=event.currentTarget; const payload=Object.fromEntries(new FormData(form).entries());
    try {
      const response=await fetch(`/api/v1/auth/${kind==="signin"?"login":"register"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json() as {message?:string;data?:{redirect?:string}};
      if(!response.ok) throw new Error(result.message??"That didn't work. Try again.");
      router.push(searchParams.get("next") ?? result.data?.redirect ?? "/studio");
      router.refresh();
    } catch(error){ setState("error"); setMessage(error instanceof Error?error.message:"That didn't work. Try again."); }
  }
  return <div className="lead-layout"><section><p className="commercial-kicker"><span/>ACCOUNT</p><h1>{content.title}</h1><p>{content.summary}</p><div className="form-proof"><ShieldCheck size={20}/><span><b>Passwords are never stored in plain text</b><small>Hashed with a unique random salt per account.</small></span></div></section><form className="commercial-form" onSubmit={submit}><label>Work email<input required type="email" name="email" autoComplete="email" placeholder="name@company.com"/></label>{kind==="signup"?<><label>Full name<input required name="name" autoComplete="name" minLength={2}/></label><label>Workspace name<input required name="organisation" autoComplete="organization" minLength={2}/></label></>:null}<label>Password<input required name="password" type="password" autoComplete={kind==="signin"?"current-password":"new-password"} minLength={8}/></label>{kind==="signup"?<label className="check-label"><input required type="checkbox" name="terms" value="accepted"/><span>I agree to the Terms of Service and Privacy Policy.</span></label>:null}<button className="public-button" disabled={state==="sending"}>{state==="sending"?<LoaderCircle className="spin" size={16}/>:null}{content.button}</button>{message?<p role="status" className={`form-status ${state}`}>{message}</p>:null}{kind==="signin"?<Link href="/sign-up">New here? Register <ArrowRight size={14}/></Link>:<Link href="/sign-in">Already have an account? Sign in <ArrowRight size={14}/></Link>}</form></div>;
}

export function AuthForm({kind}:{kind:"signin"|"signup"}) {
  return <Suspense fallback={null}><AuthFormInner kind={kind}/></Suspense>;
}

function currency(value:number){return new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:0}).format(value)}
export function RoiCalculator(){
  const [interactions,setInteractions]=useState(2000),[minutes,setMinutes]=useState(6),[hourly,setHourly]=useState(220),[automation,setAutomation]=useState(55),[plan,setPlan]=useState("professional");
  const result=useMemo(()=>calculateRoi({employees:1,monthlyInteractions:interactions,averageMinutes:minutes,monthlySalaryMinor:hourly*160*100,employerCostRate:.18,afterHoursShare:Math.max(0,Math.min(.8,(automation/100-.45)/.25)),assistedConversionImprovement:0,monthlyOpportunityValueMinor:0,planId:plan as "sandbox"|"starter"|"professional"|"business"|"enterprise",estimatedLiveMinutes:Math.round(interactions*minutes/60),estimatedPresenterMinutes:0}),[interactions,minutes,hourly,automation,plan]);
  const monthlyPlatform=(result.vowHumansAnnualCostMinor??0)/12, monthlyBenefit=(result.estimatedAnnualBenefitMinor??0)/12;
  const rows=[['Annual labour baseline',currency(result.currentAnnualCostMinor/100)],['Estimated platform cost / month',result.vowHumansAnnualCostMinor===null?'Custom quote':currency(monthlyPlatform/100)],['Indicative monthly difference',result.estimatedAnnualBenefitMinor===null?'Custom model':currency(monthlyBenefit/100)],['Estimated redirected hours / year',result.annualHoursRedirected.toFixed(1)],['Estimated payback',result.paybackMonths===null?'Not available':`${result.paybackMonths} months`]];
  function download(){const body=['Metric,Estimate',...rows.map(row=>row.map(cell=>`"${cell}"`).join(',')),'"Assumption","Directional model only; not a guarantee"'].join('\n');const url=URL.createObjectURL(new Blob([body],{type:'text/csv'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='vowhumans-roi-estimate.csv';anchor.click();URL.revokeObjectURL(url)}
  return <div className="roi-calculator"><form><label>Interactions per month<input type="number" min="1" value={interactions} onChange={event=>setInteractions(Number(event.target.value))}/></label><label>Minutes per interaction<input type="number" min="1" value={minutes} onChange={event=>setMinutes(Number(event.target.value))}/></label><label>Loaded staff cost / hour (ZAR)<input type="number" min="1" value={hourly} onChange={event=>setHourly(Number(event.target.value))}/></label><label>Estimated automation share: {automation}%<input type="range" min="45" max="65" step="5" value={automation} onChange={event=>setAutomation(Number(event.target.value))}/></label><label>Plan<select value={plan} onChange={event=>setPlan(event.target.value)}>{plans.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></form><section className="roi-output"><span className="commercial-status">DIRECTIONAL ESTIMATE</span><h2>{result.estimatedAnnualBenefitMinor===null?'Custom model':currency(monthlyBenefit/100)}</h2><p>indicative monthly difference before implementation, tax, provider overages and change-management costs</p><dl>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button type="button" className="public-button" onClick={download}><Download size={15}/>Download CSV</button></section></div>;
}

export function PortalAction({label="Create draft"}:{label?:string}){const [done,setDone]=useState(false);return <button className="public-button compact" onClick={()=>setDone(true)}>{done?<><Check size={14}/>Draft created locally</>:label}</button>}

export function InlineAction({className,idleLabel,doneLabel}:{className?:string;idleLabel:string;doneLabel:string}){const [done,setDone]=useState(false);return <button className={className} onClick={()=>setDone(true)}>{done?<><Check size={14}/>{doneLabel}</>:idleLabel}</button>}
