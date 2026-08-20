"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, AudioLines, BookOpenText, Check, CircleAlert, FileText, GraduationCap, Mic, MicOff, Play, Send, ShieldCheck, Sparkles, Video, WandSparkles } from "lucide-react";
import { useState } from "react";
import { humans } from "@/data/platform";
import { BrandLogo } from "./BrandLogo";
import { LanguageSelect } from "./LanguageSelect";
import { LiveVoiceRoom, type LiveVoiceRoomStatus } from "./LiveVoiceRoom";

function DemoHeader({ active }: { active: string }) {
  return <header className="demo-header"><Link href="/" className="demo-brand" aria-label="VowHumans home"><BrandLogo variant="lockup" /></Link><nav>{['interview','tutor','presenter'].map(item=><Link key={item} className={active===item?'active':''} href={`/demos/${item}`}>{item[0].toUpperCase()+item.slice(1)}</Link>)}</nav><span className="ai-disclosure-chip"><i/>AI experience disclosed</span></header>;
}

function InterviewDemo() {
  const [human,setHuman]=useState(humans[0]);
  const [mode,setMode]=useState('guided');
  const [context,setContext]=useState('Junior project coordinator at a growing technology company');
  const [consent,setConsent]=useState(false);
  const [demoLanguage,setDemoLanguage]=useState('');
  const [stage,setStage]=useState<'setup'|'live'|'complete'>('setup');
  const [muted,setMuted]=useState(false);
  const [liveRoom,setLiveRoom]=useState<{url:string;token:string}|null>(null);
  const [liveStatus,setLiveStatus]=useState<LiveVoiceRoomStatus|null>(null);
  async function startLiveSession(){
    setStage('live');
    setLiveRoom(null);
    setLiveStatus(null);
    try{
      const sessionRes=await fetch('/api/v1/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({digital_human_id:human.id,mode,job_context:context,transcript_consent:consent,recording_consent:consent})});
      const sessionBody=await sessionRes.json().catch(()=>null);
      if(sessionBody?.meta?.mode!=='live'||!sessionBody?.data?.id)return;
      const tokenRes=await fetch('/api/v1/livekit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:sessionBody.data.id,human_slug:human.id,...(demoLanguage?{requested_language:demoLanguage}:{})})});
      const tokenBody=await tokenRes.json().catch(()=>null);
      if(tokenBody?.meta?.mode==='live'&&tokenBody?.data?.url&&tokenBody?.data?.token) setLiveRoom({url:tokenBody.data.url,token:tokenBody.data.token});
    }catch{
      // Real backend unavailable; the live-room UI below stays in its existing safe-mock state.
    }
  }
  return <div className="demo-page interview-demo"><DemoHeader active="interview"/><main className="demo-container"><div className="demo-heading"><p className="eyebrow">PlugConnect practice lab</p><h1>Practise the room<br/>before you enter it.</h1><p>A private, supportive interview rehearsal. Your answers stay yours.</p></div>{stage==='setup'&&<section className="demo-setup-grid"><div className="demo-card"><div className="demo-step"><span>01</span><div><strong>Choose your practice partner</strong><small>Both presenters are fictional AI-generated people.</small></div></div><div className="interviewer-picker">{humans.slice(0,2).map(item=><button key={item.id} className={human.id===item.id?'selected':''} onClick={()=>setHuman(item)}><span><Image src={item.image} alt={`AI-generated ${item.name}`} fill sizes="120px"/><i><Check size={14}/></i></span><strong>{item.name}</strong><small>{item.role}</small></button>)}</div><div className="demo-step"><span>02</span><div><strong>Set the interview context</strong><small>Trusted job context grounds the session.</small></div></div><label className="demo-label">Role or job context<textarea value={context} onChange={e=>setContext(e.target.value)}/></label><div className="demo-step"><span>03</span><div><strong>Choose your pace</strong><small>Feedback changes; scoring never uses appearance.</small></div></div><div className="mode-picker">{[['realistic','Realistic'],['guided','Guided'],['quick','Quick'],['confidence','Confidence']].map(([value,label])=><button key={value} onClick={()=>setMode(value)} className={mode===value?'selected':''}>{label}</button>)}</div><label className="demo-label">Language<LanguageSelect value={demoLanguage} onChange={setDemoLanguage} capability="realtime" scope="enabled-only" includeNone="Auto-detect language"/></label><label className="consent-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span><b>I consent to this private practice session.</b><small>The mock transcript stays in this browser session and is not shared with employers.</small></span></label><button className="demo-primary" disabled={!consent||!context.trim()} onClick={startLiveSession}><Mic size={18}/>Start disclosed mock session <ArrowRight size={17}/></button></div><div className="demo-aside"><div className="demo-portrait"><Image src={human.image} alt={`Original fictional AI-generated portrait of ${human.name}`} fill priority sizes="420px"/><span><Sparkles size={14}/>Fictional AI-generated interviewer</span></div><h2>{human.name}</h2><p>{human.role}</p><div className="aside-promise"><ShieldCheck size={19}/><span><b>Candidate-owned practice</b>Your answers are never exposed to an employer.</span></div></div></section>}{stage==='live'&&<section className="live-room"><div className="room-visual"><Image src={human.image} alt={`AI-generated portrait of ${human.name}`} fill priority sizes="60vw"/><div className="room-scrim"/><span className="room-disclosure"><Sparkles size={14}/>AI-generated practice interviewer</span><div className="room-state"><AudioLines size={20}/><span><small>{human.name} is</small>Speaking</span></div><div className="room-caption">“Let’s begin with something comfortable. Tell me a little about yourself and what drew you to this role.”</div>{liveRoom&&<LiveVoiceRoom url={liveRoom.url} token={liveRoom.token} muted={muted} onStatusChange={setLiveStatus}/>}</div><aside className="room-panel"><div><p className="eyebrow">{liveRoom?'Live voice room':'Private mock room'}</p><h2>{mode[0].toUpperCase()+mode.slice(1)} practice</h2><p>{context}</p></div><div className="mock-transcript"><span><b>{human.name}</b><p>Welcome. I’m an AI-generated practice interviewer. This session is for your preparation only.</p></span><span className="candidate"><b>You</b><p>{liveRoom?(liveStatus==='connected'?'Live voice is connected. Speak naturally — this is a real AI conversation.':liveStatus==='error'?'Live voice failed to connect. Continuing in safe mock; no audio was captured.':'Connecting live voice…'):'Microphone capture is disabled in this safe mock. Continue to see the feedback contract.'}</p></span></div><div className="room-controls"><button aria-label={muted?'Unmute microphone':'Mute microphone'} aria-pressed={muted} className={muted?'muted':''} onClick={()=>setMuted(value=>!value)}>{muted?<MicOff size={19}/>:<Mic size={19}/>}</button><button className="end-call" onClick={()=>setStage('complete')}>End practice</button></div></aside></section>}{stage==='complete'&&<section className="complete-card"><span className="complete-icon"><Check size={28}/></span><p className="eyebrow">Practice complete</p><h2>Your preparation belongs to you.</h2><p>The mock session shows the candidate-owned completion flow. No audio was recorded, no employer received answers and no provider cost was incurred.</p><div className="feedback-grid"><div><span>STRUCTURE</span><strong>Use STAR more explicitly</strong><p>Name the situation, your action and the result.</p></div><div><span>CONFIDENCE</span><strong>Strong opening</strong><p>Your role motivation was clear and specific.</p></div></div><button className="demo-primary" onClick={()=>setStage('setup')}><ArrowLeft size={17}/>Practise again</button></section>}</main></div>;
}

function TutorDemo(){
  const [question,setQuestion]=useState('Why is active listening important in customer service?');
  const [asked,setAsked]=useState(false);
  const lessons=['Service foundations','Active listening','Clear communication','Handling escalation'];
  const [lessonIndex,setLessonIndex]=useState(1);
  return <div className="demo-page tutor-demo"><DemoHeader active="tutor"/><main className="demo-container"><div className="demo-heading compact"><p className="eyebrow">GoalVow Academy tutor</p><h1>Ask the curriculum.<br/>Get a cited answer.</h1><p>The tutor stays inside approved lesson material and tells you when a source is missing.</p></div><section className="tutor-room"><aside className="course-sidebar"><span className="course-icon"><GraduationCap size={23}/></span><p className="eyebrow">Current course</p><h2>Customer Service Essentials</h2><div className="lesson-list">{lessons.map((lesson,index)=><button key={lesson} className={lessonIndex===index?'active':''} onClick={()=>setLessonIndex(index)}><span>{String(index+1).padStart(2,'0')}</span>{lesson} {index<lessonIndex?<Check size={14}/>:null}</button>)}</div><div className="course-source"><BookOpenText size={18}/><span><b>2 approved sources</b>Lesson guide · Policy notes</span></div></aside><div className="tutor-chat"><div className="tutor-profile"><span><Image src={humans[2].image} alt="AI-generated GoalVow Tutor" fill sizes="64px"/></span><div><strong>GoalVow Tutor</strong><small><i/>AI-generated course facilitator</small></div></div><div className="tutor-messages"><div className="tutor-bubble"><p>Welcome back. We’re working through active listening. What would you like to understand?</p></div>{asked&&<div className="learner-bubble"><p>{question}</p></div>}{asked&&<div className="tutor-bubble answer"><p>Active listening helps a customer feel heard and gives you the detail needed to respond accurately. The lesson recommends listening without interrupting, reflecting the key concern, and confirming the next step.</p><div className="citations"><span><FileText size={14}/>Lesson 2, “Listen to understand”</span><span><FileText size={14}/>Service guide §3.1</span></div></div>}</div><form className="tutor-input" onSubmit={e=>{e.preventDefault();setAsked(true)}}><input aria-label="Ask the tutor" value={question} onChange={e=>{setQuestion(e.target.value);setAsked(false)}}/><button aria-label="Send question" disabled={!question.trim()}><Send size={18}/></button></form><p className="input-note"><ShieldCheck size={13}/>Mock answer grounded in the displayed sample sources. No answer keys exposed.</p></div></section></main></div>;
}

function PresenterPlayButton(){
  const [tried,setTried]=useState(false);
  return <button className="present-play" aria-label={tried?"Rendered preview not available yet":"Play preview"} onClick={()=>setTried(true)}>{tried?<CircleAlert size={25}/>:<Play size={25} fill="currentColor"/>}</button>;
}

function PresenterDemo(){
  const [script,setScript]=useState('Every strong learning journey begins with one clear next step. Welcome to GoalVow Academy.');
  const [presenter,setPresenter]=useState(humans[2]);
  const [format,setFormat]=useState('16:9 lesson');
  const [status,setStatus]=useState<'draft'|'rendering'|'ready'>('draft');
  function generate(){setStatus('rendering');window.setTimeout(()=>setStatus('ready'),1100)}
  return <div className="demo-page presenter-demo"><DemoHeader active="presenter"/><main className="demo-container"><div className="demo-heading compact"><p className="eyebrow">VowHumans Present</p><h1>From lesson script<br/>to honest preview.</h1><p>Build scenes now; connect licensed voice, GPU rendering and FFmpeg when infrastructure is ready.</p></div><section className="present-demo-grid"><div className="demo-card"><label className="demo-label">Lesson script<textarea value={script} onChange={e=>{setScript(e.target.value);setStatus('draft')}}/><small>{script.length} / 2,000</small></label><label className="demo-label">Presenter</label><div className="presenter-picker">{humans.map(item=><button key={item.id} className={presenter.id===item.id?'selected':''} onClick={()=>setPresenter(item)}><span><Image src={item.image} alt={`AI-generated portrait of ${item.name}`} fill sizes="48px"/></span><div><b>{item.name}</b><small>{item.role}</small></div>{presenter.id===item.id?<Check size={15}/>:null}</button>)}</div><div className="export-options">{['16:9 lesson','9:16 clip','1:1 promo'].map(option=><button key={option} className={format===option?'selected':''} onClick={()=>{setFormat(option);setStatus('draft')}}>{option}</button>)}</div><button className="demo-primary" onClick={generate} disabled={!script.trim()||status==='rendering'}>{status==='rendering'?<AudioLines size={18}/>:<WandSparkles size={18}/>} {status==='rendering'?'Building scenes…':status==='ready'?'Rebuild mock preview':'Generate mock preview'}</button></div><div className="present-result"><div className="present-stage"><Image src={presenter.image} alt={`AI-generated ${presenter.name}`} fill sizes="560px"/><div className="present-overlay"/><span className="room-disclosure"><Sparkles size={13}/>AI-generated presenter</span>{status==='ready'?<><PresenterPlayButton/><p>{script}</p></>:<div className="stage-placeholder"><Video size={28}/><strong>{status==='rendering'?'Preparing mock scene':'Your preview will appear here'}</strong><small>No live render is being claimed.</small></div>}</div><div className="render-truth"><CircleAlert size={17}/><span><b>{status==='ready'?'Static mock preview ready':'Production renderer not configured'}</b>{status==='ready'?'Review the layout and disclosure before connecting real media services.':'FFmpeg, TTS and approved GPU workers are required for MP4 export.'}</span></div></div></section></main></div>;
}

export function DemoExperience({demo}:{demo:'interview'|'tutor'|'presenter'}){
  if(demo==='interview') return <InterviewDemo/>;
  if(demo==='tutor') return <TutorDemo/>;
  return <PresenterDemo/>;
}
