/* Exercise the real React hook, recovery card, session store and HTTP classification in Chromium.
 * Only external wallet, chain and proving boundaries are simulated. No keys, funds or real RPCs.
 * Run: bun run test:submission-recovery (first run: bunx playwright install chromium).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("playwright");

const app = path.resolve(__dirname, "..");
const stubs = {
  wagmi: `export const useAccount=()=>({address:window.qa.account,chainId:1});
    export const useSignTypedData=()=>({signTypedDataAsync:async()=>{window.qa.signatures++;return '0x'+'01'.repeat(65)}});
    export const useSwitchChain=()=>({switchChainAsync:async()=>{}});`,
  constants: `export const PUB_CHAIN={id:1,name:'Test chain'},PUB_CRISP_SERVER_URL='/mock',
    PUB_VOTING_POWER_SOURCE='0x'+'22'.repeat(20);`,
  Alerts: `export const useAlerts=()=>({addAlert:(title,options)=>window.qa.alerts.push({title,...options})});`,
  usePrivatePair: `export const usePrivatePair=()=>({body:'0x'+'22'.repeat(20)});`,
  crispSdk: `export const crispSdk={getRoundStateLite:async()=>({status:'Active',num_options:'3',start_time:10}),
    prepareBallot:async(input)=>{window.qa.lastVote=input.vote;return {ctCommitment:1n}}};`,
  circuits: `export const ensureCircuits=async()=>{};`,
  client: `export const publicClient={readContract:async r=>r.functionName==='getVotingToken'?'0x'+'22'.repeat(20):r.functionName==='decimals'?0:10000n,
    getTransactionReceipt:async()=>{if(window.qa.receipt==='pending')throw Error('Receipt not available');return {status:window.qa.receipt}}};`,
  ballotDigest: `export const CensusMode={ONCHAIN:1},getOnchainVotingPower=async()=>10000n,getCensusMode=async()=>1,
    resolveCrispProgram=async()=>'0x'+'22'.repeat(20),getRoundSnapshot=async()=>3n,
    getVotingPowerDivisor=async()=>1n,ballotSignatureRequest=()=>({}),getBallotDigest=async()=>0n;`,
  usePublishVote: `export const usePublishVote=()=>({canPublish:true,publish:async(_payload,options)=>{
    window.qa.prompts++;
    if(window.qa.wallet==='wait')await new Promise(r=>window.qa.releaseWallet=r);
    if(window.qa.wallet==='reject')throw Error('User rejected the request');
    if(window.qa.wallet==='error')throw Error('Wallet disconnected');
    options.onSubmitted?.(window.qa.hash);
    if(window.qa.wallet==='sent-timeout')throw Error('Receipt RPC timeout');
    return window.qa.hash;
  }});`,
  useCommitteeKeyCheck: `export const useCommitteeKeyCheck=()=>async()=>({key:[0],presetName:'qa'});`,
  usePreparedBallot: `export const usePreparedBallot=()=>({ballot:null});`,
  sdk: `export const finishBallotProof=async()=>({}),finishMaskProof=async()=>({}),
    getZeroVote=n=>Array(n).fill(0n),encodeSolidityProof=()=>window.qa.encode();`,
};
const boundaryPlugin = {
  name: "simulated-external-boundaries",
  setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path: p, importer }) => {
      const name = p === "@crisp-e3/sdk" ? "sdk" : p.split("/").pop();
      if (stubs[name] && importer.endsWith("/useCrispServer.ts")) return { path: name, namespace: "qa" };
    });
    b.onLoad({ filter: /.*/, namespace: "qa" }, ({ path: p }) => ({ contents: stubs[p] }));
  },
};

const entry = `
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import {encodeAbiParameters,parseAbiParameters,keccak256} from 'viem';
import {useCrispServer} from './plugins/crispVoting/hooks/useCrispServer';
import {PendingSubmissionCard} from './plugins/crispVoting/components/vote/pendingSubmissionCard';
import {pendingSubmissions,submissionJobId} from './plugins/crispVoting/utils/pendingSubmission';
const q=window.qa={account:'0x'+'11'.repeat(20),hash:'0x'+'ab'.repeat(32),wallet:'reject',receipt:'pending',
  read:'ready',post:200,prompts:0,signatures:0,posts:[],reads:0,alerts:[],lastVote:[1n,0n,0n]};
q.encode=()=>{const ciphertext='0xaa'+(q.lastVote.findIndex(n=>BigInt(n)>0n)+1).toString(16).padStart(2,'0');
  return encodeAbiParameters(parseAbiParameters('bytes,address,bytes32,bytes32,uint40,bytes'),
    ['0x1234',q.account,'0x'+'33'.repeat(32),keccak256(ciphertext),7,ciphertext]);};
q.scope=()=>({chainId:1,plugin:'0x'+'22'.repeat(20),roundId:42n,voter:q.account});
q.storageKey=()=> 'interfold-pending-submission-v1:1:'+q.scope().plugin+':42:'+q.account;
q.record=()=>{try{return pendingSubmissions.get(q.scope())??null}catch{return 'unreadable'}};
q.seed=(options={})=>{const encoded_proof=q.encode();pendingSubmissions.save(q.scope(),{
  jobId:submissionJobId('42',encoded_proof),kind:options.kind??'vote',prepare:false,
  request:{round_id:'42',encoded_proof,address:q.account,send_from_wallet:true},
  ...(options.hash?{transactionHash:q.hash}:{})});};
q.serverView=id=>({job_id:id,status:q.read==='pending'?'pending_commitment':q.read==='failed'?'failed_broadcast':
  q.read==='confirmed'?'success':'ready_for_commitment',tx_hash:q.read==='confirmed'?q.hash:null,
  encoded_proof:'0x1234',message:q.read==='failed'?'The input deadline passed':null});
const originalFetch=window.fetch;
window.fetch=async(url,init={})=>{
  if(!String(url).startsWith('/mock/'))return originalFetch(url,init);
  if(init.method==='POST'){
    q.posts.push(init.body); if(q.post==='lost')throw Error('Response lost');
    const request=JSON.parse(init.body);
    return q.post===200?Response.json(q.serverView(submissionJobId(request.round_id,request.encoded_proof))):
      Response.json({error:q.post===429?'Rate limit; try again':'The input deadline passed'}, {status:q.post});
  }
  q.reads++;
  if(q.read==='offline')throw Error('Network unavailable');
  if(q.read==='missing')return new Response('',{status:404});
  return Response.json(q.serverView(String(url).split('/').pop()));
};
function App(){
  const [,render]=useState(0),[choice,setChoice]=useState('Yes');
  const vote=useCrispServer(42n);
  q.view={recovery:vote.submissionRecovery,loading:vote.isLoading,step:vote.votingStep,error:vote.error,choice};
  q.refresh=()=>render(n=>n+1); q.recover=vote.recoverSubmission;
  q.send=async()=>{const weight=await vote.getVoteWeight(true);
    q.result=await vote.postVote(BigInt(['Yes','No','Abstain'].indexOf(choice)),42n,3n,false,true,{weight});};
  return <main className="proposal-detail-ballot" style={{maxWidth:600,margin:'24px auto',padding:16}}>
    {vote.submissionRecovery?<PendingSubmissionCard recovery={vote.submissionRecovery} onRecover={vote.recoverSubmission} onDiscard={vote.discardSubmission}/>:
      <section aria-label="Ballot"><label>Choice <select value={choice} onChange={e=>setChoice(e.target.value)}>
        {['Yes','No','Abstain'].map(c=><option key={c}>{c}</option>)}</select></label>
        <button disabled={vote.isLoading} onClick={()=>void q.send()}>Send ballot</button></section>}
  </main>;
}
q.mount=()=>createRoot(document.getElementById('root')).render(<App/>);
`;

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "submission-recovery-"));
  await build({
    stdin: { contents: entry, resolveDir: app, sourcefile: "recovery-fixture.tsx", loader: "tsx" },
    bundle: true,
    format: "iife",
    jsx: "automatic",
    tsconfig: path.join(app, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [boundaryPlugin],
    outfile: path.join(dir, "fixture.js"),
    logLevel: "warning",
  });
  const server = http.createServer(async (req, res) => {
    if (req.url === "/fixture.js" || req.url === "/fixture.css") {
      res.setHeader("Content-Type", req.url.endsWith("js") ? "text/javascript" : "text/css");
      res.end(await fs.readFile(path.join(dir, req.url.slice(1))).catch(() => ""));
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'
      );
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  let passed = 0;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_CHANNEL ? { channel: process.env.CHROME_CHANNEL } : {}),
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    async function scenario(name, run) {
      const context = await browser.newContext(
        process.argv.includes("--mobile")
          ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
          : { viewport: { width: 1280, height: 835 } }
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      try {
        await page.goto(url);
        await page.waitForFunction(() => !!window.qa);
        await run(page);
        assert.deepEqual(errors, [], "Uncaught browser errors");
        console.log(`PASS ${name}`);
        passed++;
      } finally {
        await context.close();
      }
    }
    const ballot = (page) => page.getByRole("region", { name: "Ballot" }).waitFor();
    const ready = (page) => page.getByRole("button", { name: "Continue submission" }).waitFor();
    const kept = (page) => page.waitForFunction(() => window.qa.view.recovery && !window.qa.view.recovery.busy);
    async function canChange(page) {
      await ballot(page);
      await page.getByRole("combobox").selectOption("No");
      assert.equal(await page.evaluate(() => window.qa.view.choice), "No");
      assert.equal(await page.evaluate(() => window.qa.record()), null);
    }
    await scenario("decline the original wallet transaction, change choice, then send successfully", async (page) => {
      await page.evaluate(() => window.qa.mount());
      await page.getByRole("button", { name: "Send ballot" }).click();
      await page.waitForFunction(() => window.qa.result !== undefined);
      await canChange(page);
      assert.equal(await page.evaluate(() => window.qa.result.uncertain), undefined);
      await page.evaluate(() => {
        window.qa.wallet = "success";
        window.qa.result = undefined;
      });
      await page.getByRole("button", { name: "Send ballot" }).click();
      await page.waitForFunction(() => window.qa.result?.success);
      assert.equal(await page.evaluate(() => window.qa.prompts), 2);
      assert.equal(await page.evaluate(() => window.qa.lastVote[0].toString()), "0");
      assert.notEqual(...(await page.evaluate(() => window.qa.posts)));
    });
    await scenario("decline a recovered wallet prompt; no signing or broadcast on restore", async (page) => {
      await page.evaluate(() => {
        window.qa.seed();
        window.qa.mount();
      });
      await ready(page);
      assert.equal(await page.evaluate(() => window.qa.prompts + window.qa.signatures + window.qa.posts.length), 0);
      await page.getByRole("button", { name: "Continue submission" }).click();
      await canChange(page);
    });
    for (const [read, post, cleared] of [
      ["missing", 400, true],
      ["missing", 409, true],
      ["failed", 422, true],
      ["missing", 429, false],
      ["offline", 400, false],
      ["missing", 503, false],
      ["missing", "lost", false],
    ])
      await scenario(`retry: read=${read}, HTTP=${post}, clears=${cleared}`, async (page) => {
        await page.evaluate(
          ({ read, post }) => {
            Object.assign(window.qa, { read, post });
            window.qa.seed();
            window.qa.mount();
          },
          { read, post }
        );
        await page.waitForFunction(() => window.qa.view.recovery?.state !== "checking");
        await page.getByRole("button", { name: "Retry same submission" }).click();
        if (cleared) await canChange(page);
        else {
          await kept(page);
          assert.ok(await page.evaluate(() => window.qa.record()));
        }
        assert.equal(await page.evaluate(() => window.qa.posts.length), 1);
        assert.equal(await page.evaluate(() => window.qa.prompts + window.qa.signatures), 0);
      });
    await scenario("manual discard of uncertain vote and mask, no automatic resend", async (page) => {
      await page.evaluate(() => {
        window.qa.read = "offline";
        window.qa.seed();
        window.qa.mount();
      });
      await page.getByRole("button", { name: "Discard and start again" }).click();
      await canChange(page);
      await page.evaluate(() => window.qa.seed({ kind: "mask" }));
      await page.getByRole("button", { name: "Discard and start again" }).click();
      await ballot(page);
      assert.equal(await page.evaluate(() => window.qa.posts.length + window.qa.prompts), 0);
    });
    await scenario(
      "known transaction survives reload; cannot discard or send twice; confirmed receipt resolves it",
      async (page) => {
        await page.evaluate(() => {
          window.qa.seed({ hash: true });
          window.qa.mount();
        });
        await kept(page);
        assert.equal(await page.getByRole("button", { name: "Discard and start again" }).count(), 0);
        await page.reload();
        await page.evaluate(() => window.qa.mount());
        await kept(page);
        await page.evaluate(() => window.qa.recover());
        assert.equal(await page.evaluate(() => window.qa.posts.length + window.qa.prompts), 0);
        assert.ok(await page.evaluate(() => window.qa.record().transactionHash));
        await page.evaluate(async () => {
          window.qa.receipt = "success";
          await window.qa.recover();
        });
        await ballot(page);
        assert.equal(await page.evaluate(() => window.qa.record()), null);
      }
    );
    await scenario("receipt timeout after sending retains the hash and never opens a second prompt", async (page) => {
      await page.evaluate(() => {
        window.qa.wallet = "sent-timeout";
        window.qa.mount();
      });
      await page.getByRole("button", { name: "Send ballot" }).click();
      await page.waitForFunction(() => window.qa.result?.uncertain);
      await kept(page);
      await page.evaluate(() => window.qa.recover());
      assert.equal(await page.evaluate(() => window.qa.prompts), 1);
      assert.ok(await page.evaluate(() => window.qa.record().transactionHash));
      assert.equal(await page.getByRole("button", { name: "Discard and start again" }).count(), 0);
    });
    await scenario(
      "corrupt record can be cleared from the actual recovery card and stays cleared after reload",
      async (page) => {
        await page.evaluate(() => {
          sessionStorage.setItem(window.qa.storageKey(), "{bad");
          window.qa.mount();
        });
        await page.getByRole("button", { name: "Clear saved submission" }).click();
        await canChange(page);
        await page.reload();
        await page.evaluate(() => window.qa.mount());
        await ballot(page);
        assert.equal(await page.evaluate(() => window.qa.record()), null);
      }
    );
    await scenario("storage failure keeps the recovery card and explains why clearing failed", async (page) => {
      await page.evaluate(() => {
        window.qa.seed();
        Storage.prototype.removeItem = () => {
          throw Error("Blocked");
        };
        window.qa.mount();
      });
      await page.getByRole("button", { name: "Discard and start again" }).click();
      await page.getByRole("alert").filter({ hasText: "Could not clear" }).waitFor();
      assert.ok(await page.evaluate(() => window.qa.record()));
    });
    await scenario("discard is disabled while a wallet prompt is open", async (page) => {
      await page.evaluate(() => {
        window.qa.wallet = "wait";
        window.qa.seed();
        window.qa.mount();
      });
      await ready(page);
      await page.getByRole("button", { name: "Continue submission" }).click();
      await page.waitForFunction(() => !!window.qa.releaseWallet);
      assert.equal(await page.getByRole("button", { name: "Discard and start again" }).isDisabled(), true);
      await page.evaluate(() => {
        window.qa.wallet = "reject";
        window.qa.releaseWallet();
      });
      await canChange(page);
    });
    await scenario("a wallet switch during a prompt cannot discard the other wallet's pending ballot", async (page) => {
      await page.evaluate(() => {
        window.qa.wallet = "wait";
        window.qa.seed();
        window.qa.mount();
      });
      await ready(page);
      await page.getByRole("button", { name: "Continue submission" }).click();
      await page.waitForFunction(() => !!window.qa.releaseWallet);
      await page.evaluate(() => {
        window.qa.account = "0x" + "44".repeat(20);
        window.qa.seed();
        window.qa.refresh();
      });
      await page.waitForFunction(() => !!window.qa.view.recovery);
      await page.evaluate(() => {
        window.qa.wallet = "reject";
        window.qa.releaseWallet();
      });
      await page.waitForFunction(() => !window.qa.view.recovery.busy);
      assert.ok(
        await page.evaluate(() => window.qa.record()),
        "Other account's ballot must survive the first account's rejection"
      );
      await page.getByRole("button", { name: "Discard and start again" }).click();
      await ballot(page);
    });
    await scenario("lost response survives refresh and can be discarded without another signature", async (page) => {
      await page.evaluate(() => {
        window.qa.read = "offline";
        window.qa.post = "lost";
        window.qa.mount();
      });
      await page.getByRole("button", { name: "Send ballot" }).click();
      await page.waitForFunction(() => window.qa.result?.uncertain);
      const saved = await page.evaluate(() => JSON.stringify(window.qa.record()));
      await page.reload();
      await page.evaluate(() => {
        window.qa.read = "offline";
        window.qa.mount();
      });
      await kept(page);
      assert.deepEqual(await page.evaluate(() => JSON.parse(JSON.stringify(window.qa.record()))), JSON.parse(saved));
      assert.equal(await page.evaluate(() => window.qa.posts.length + window.qa.signatures + window.qa.prompts), 0);
      await page.getByRole("button", { name: "Discard and start again" }).click();
      await canChange(page);
    });
    console.log(
      `Submission recovery: ${passed} browser scenarios passed (${process.argv.includes("--mobile") ? "mobile" : "desktop"}).`
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
