import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
const textFiles=files.filter(file=>!(/\.(png|jpe?g|gif|webp|ico|zip|lock)$/i.test(file)));
const patterns=[
  {name:"private key",re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:"OpenAI key",re:/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/},
  {name:"Stripe live key",re:/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/},
  {name:"JWT",re:/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/},
];
const findings=[];
for(const file of textFiles){let body="";try{body=readFileSync(file,"utf8")}catch{continue}for(const pattern of patterns){if(pattern.re.test(body))findings.push(`${file}: ${pattern.name}`)}}
const vercelIgnore=readFileSync(".vercelignore","utf8");
for(const required of ["public/php","public/sql","backend-artifacts","**/*.sql","**/*.zip"]){if(!vercelIgnore.includes(required))findings.push(`.vercelignore: missing ${required}`)}
if(findings.length){console.error("Security scan failed:\n"+findings.join("\n"));process.exit(1)}
console.log(`Security scan passed (${textFiles.length} text files; public PHP/SQL deployment exclusions present).`);
