/* IDM ring-road engine. SI internally; no network, no dependencies. */
(function (root) {
  'use strict';
  const defaults = {N:22,L:230,v0:30/3.6,T:1,a:0.6,b:1.5,s0:2,length:4.5,dt:0.05,delta:4};
  const mod=(x,L)=>((x%L)+L)%L;
  function equilibriumSpeed(N,p={}) {
    p=Object.assign({},defaults,p);
    const s=p.L/N-p.length;
    if(s<=p.s0) return 0;
    let lo=0,hi=p.v0;
    for(let k=0;k<65;k++){
      const v=(lo+hi)/2;
      const f=1-Math.pow(v/p.v0,p.delta)-Math.pow((p.s0+v*p.T)/s,2);
      if(f>0) lo=v; else hi=v;
    }
    return (lo+hi)/2;
  }
  class Simulation {
    constructor(p={}) {
      this.params=Object.assign({},defaults,p);
      const q=this.params;
      if(!Number.isInteger(q.N)||q.N<2||q.N*(q.length+q.s0)>=q.L||q.dt<=0||q.T<=0||q.v0<=0) throw Error('Invalid ring parameters');
      this.t=0; this.steps=0; this.guards=0; this.events=[]; this.active=null;
      this.x=Array.from({length:q.N},(_,i)=>i*q.L/q.N);
      const ve=equilibriumSpeed(q.N,q);
      this.v=Array.from({length:q.N},(_,i)=>Math.max(0,ve*(1+0.005*Math.sin(2*Math.PI*i/q.N))));
      this.acc=Array(q.N).fill(0);
    }
    gaps(){const p=this.params;return this.x.map((x,i)=>mod(this.x[(i+1)%p.N]-x,p.L)-p.length);}
    disturb(id=0,duration=2,decel=2){
      if(!Number.isInteger(id)||id<0||id>=this.params.N) throw Error('Invalid vehicle');
      this.active={id,end:this.t+duration,decel};
      this.events.push({t_s:this.t,vehicle_id:id+1,duration_s:duration,extra_deceleration_m_s2:decel});
    }
    step(){
      const p=this.params,n=p.N,h=p.dt,g=this.gaps(),d=[],nv=[],aa=[];
      for(let i=0;i<n;i++){
        const v=this.v[i],dv=v-this.v[(i+1)%n];
        const desired=p.s0+Math.max(0,v*p.T+v*dv/(2*Math.sqrt(p.a*p.b)));
        let a=p.a*(1-Math.pow(v/p.v0,p.delta)-Math.pow(desired/Math.max(g[i],1e-8),2));
        if(this.active&&this.active.id===i&&this.t<this.active.end-1e-9) a-=this.active.decel;
        aa[i]=a;
        // Ballistic integration, stop at exact zero rather than reversing.
        nv[i]=Math.max(0,v+a*h);
        d[i]=(a<0&&v+a*h<0)?-v*v/(2*a):v*h+0.5*a*h*h;
      }
      // Last-resort exclusion guard. In validated default runs this must remain unused.
      // Solve simultaneous displacement inequalities on the periodic lane.
      for(let k=0;k<n;k++){
        let changed=false;
        for(let i=0;i<n;i++){
          const limit=Math.max(0,g[i]-1e-6+d[(i+1)%n]);
          if(d[i]>limit+1e-12){d[i]=limit;nv[i]=Math.min(nv[i],d[i]/h);changed=true;this.guards++;}
        }
        if(!changed) break;
      }
      this.x=this.x.map((x,i)=>x+Math.max(0,d[i])); this.v=nv;this.acc=aa;
      this.steps++;this.t=this.steps*h;
      if(this.active&&this.t>=this.active.end-1e-9)this.active=null;
      return this;
    }
    metrics(){
      const n=this.params.N,mean=this.v.reduce((a,b)=>a+b,0)/n;
      const V=mean*3.6,K=n/(this.params.L/1000);
      return {K,V,Q:K*V,minGap:Math.min(...this.gaps()),minV:Math.min(...this.v),stdV:Math.sqrt(this.v.reduce((a,v)=>a+(v-mean)**2,0)/n)*3.6};
    }
    record(){return Object.assign({t:this.t,x:this.x.map(x=>mod(x,this.params.L)),unwrapped:this.x.slice(),v:this.v.slice(),gaps:this.gaps(),acc:this.acc.slice(),guards:this.guards},this.metrics());}
  }
  function sampleDensity(params,N,options={}){
    const o=Object.assign({warmup:180,duration:120,disturbAt:20},options);
    const sim=new Simulation(Object.assign({},params,{N}));
    let applied=false,sumV=0,sumV2=0,sumSpatial=0,count=0,minGap=Infinity,minV=Infinity;
    const steps=Math.round((o.warmup+o.duration)/sim.params.dt);
    for(let k=0;k<steps;k++){
      if(!applied&&sim.t>=o.disturbAt){sim.disturb(0,2,2);applied=true;}
      sim.step();
      minV=Math.min(minV,...sim.v);minGap=Math.min(minGap,...sim.gaps());
      if(sim.t>=o.warmup&&sim.steps%Math.round(0.5/sim.params.dt)===0){
        const m=sim.metrics();sumV+=m.V;sumV2+=m.V*m.V;sumSpatial+=m.stdV;count++;
      }
    }
    const V=sumV/count,K=N/(sim.params.L/1000);
    return {N,K,V,Q:K*V,stdV:Math.sqrt(Math.max(0,sumV2/count-V*V)),meanSpatialStdV:sumSpatial/count,count,warmup_s:o.warmup,duration_s:o.duration,minGap_m:minGap,minV_m_s:minV,safetyGuardCount:sim.guards,params:Object.assign({},sim.params),disturbance:{vehicle_id:1,at_s:o.disturbAt,duration_s:2,decel_m_s2:2}};
  }
  const api={Simulation,equilibriumSpeed,sampleDensity,defaults,mod,version:'IDM-V1.0'};
  root.TrafficEngine=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
