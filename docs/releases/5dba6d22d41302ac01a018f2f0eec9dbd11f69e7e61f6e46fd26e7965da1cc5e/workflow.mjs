// The actual button handler delegates here; tests exercise this handler, not a mirror.
export function createCalculationHandler(deps){
 return async()=>{
  deps.invalidate();
  let refreshed=false;try{refreshed=await deps.refresh();}catch{refreshed=false;}
  const input=deps.getInput();
  const authorization=deps.authorize(input);
  if(!refreshed||!authorization.allowedFrames.length){deps.block(authorization);return;}
  let result;try{result=deps.calculate(input);}catch(error){deps.block({issues:[error.message],allowedFrames:[]});return;}
  const blockedInput=result.frames.filter(f=>authorization.allowedFrames.includes(f.frame)&&f.pending.length>0);
  const frames=result.frames.filter(f=>authorization.allowedFrames.includes(f.frame)&&f.pending.length===0);
  const blockedFrames=[...(authorization.blockedFrames??[]),...blockedInput.map(f=>({frame:f.frame,reasons:f.pending}))];
  if(!frames.length){deps.block({issues:[...result.issues,...blockedFrames.flatMap(f=>f.reasons)],allowedFrames:[]});return;}
  deps.show({...result,frames,blockedFrames},input);
 };
}
