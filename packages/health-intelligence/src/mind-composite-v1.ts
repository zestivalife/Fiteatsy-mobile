import {STAR_ORB_METHODOLOGY_VERSION} from './methodology-v1.js';

export const MIND_CHECK_IN_VERSION='FITEATSY_MIND_CHECK_IN_V1' as const;
export const MIND_COMPOSITE_METHODOLOGY_VERSION='FITEATSY_MIND_COMPOSITE_V1' as const;
export const MIND_RESPONSE_VALUES=[0,25,50,75,100] as const;
export type MindQuestionKey='emotionalFeeling'|'emotionalBalance'|'mentalEnergy'|'concentration';
export type MindCheckInAnswers=Record<MindQuestionKey,typeof MIND_RESPONSE_VALUES[number]>;
export type MindCompositeSource={score:number|null;status:string;healthDay:string;calculatedAt:string;methodologyVersion:string;inputFreshness?:string};
export type MindCompositeSources={calm?:MindCompositeSource|null;sleep?:MindCompositeSource|null;activity?:MindCompositeSource|null;nutrition?:MindCompositeSource|null};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
export const calculateMindQuestionnaire=(answers:MindCheckInAnswers)=>{
  const values=Object.values(answers);
  if(values.length!==4||values.some(value=>!MIND_RESPONSE_VALUES.includes(value)))throw new RangeError('INVALID_MIND_CHECK_IN_ANSWERS');
  return values.reduce<number>((sum,value)=>sum+value,0)/4;
};

export const calculateMindCompositeV1=(input:{answers:MindCheckInAnswers;healthDay:string;calculatedAt?:string;sources:MindCompositeSources})=>{
  const questionnaireScore=calculateMindQuestionnaire(input.answers);
  const components=[
    {key:'questionnaire',weight:.40,score:questionnaireScore,source:null},
    {key:'calm',weight:.15,score:input.sources.calm?.score,source:input.sources.calm??null},
    {key:'sleep',weight:.15,score:input.sources.sleep?.score,source:input.sources.sleep??null},
    {key:'activity',weight:.15,score:input.sources.activity?.score,source:input.sources.activity??null},
    {key:'nutrition',weight:.15,score:input.sources.nutrition?.score,source:input.sources.nutrition??null}
  ];
  const sourceEligible=(source:MindCompositeSource)=>source.healthDay===input.healthDay
    && ['CALCULATED','PARTIAL'].includes(source.status)
    && source.inputFreshness==='CURRENT'
    && source.methodologyVersion===STAR_ORB_METHODOLOGY_VERSION
    && Number.isFinite(Date.parse(source.calculatedAt));
  const eligible=components.filter(component=>finite(component.score)&&(component.source==null||sourceEligible(component.source)));
  const observedWeight=eligible.reduce((sum,component)=>sum+component.weight,0);
  const weightedTotal=eligible.reduce((sum,component)=>sum+(component.score as number)*component.weight,0);
  // Missing inputs are never zero. The available-weight mean remains useful,
  // while PARTIAL and coverage make clear it is not a fully observed result.
  const score=observedWeight?Number((weightedTotal/observedWeight).toFixed(2)):null;
  const inputsUsed=eligible.map(component=>component.key);
  const inputsMissing=components.filter(component=>!inputsUsed.includes(component.key)).map(component=>component.key);
  const suppliedSources=components.flatMap(component=>component.source?[component.source]:[]);
  const inputFreshness=suppliedSources.some(source=>source.inputFreshness==='STALE')?'STALE' as const
    :suppliedSources.some(source=>source.inputFreshness!=='CURRENT'||!Number.isFinite(Date.parse(source.calculatedAt)))?'UNKNOWN' as const
    :'CURRENT' as const;
  return {domain:'mind',score,status:inputsMissing.length?'PARTIAL' as const:'CALCULATED' as const,
    methodologyId:MIND_COMPOSITE_METHODOLOGY_VERSION,methodologyVersion:MIND_COMPOSITE_METHODOLOGY_VERSION,
    questionnaireVersion:MIND_CHECK_IN_VERSION,questionnaireScore,healthDay:input.healthDay,
    calculatedAt:input.calculatedAt??new Date().toISOString(),confidence:inputsMissing.length?'MODERATE' as const:'HIGH' as const,
    inputFreshness,componentCoverage:Number((observedWeight*100).toFixed(2)),inputsUsed,inputsMissing,
    contributingFactors:inputsUsed,explanation:inputsMissing.length?`Estimated from ${inputsUsed.join(', ')}; missing ${inputsMissing.join(', ')}.`:'Calculated from the daily check-in and all four eligible Star Orb domains.',
    sourceComponents:Object.fromEntries(components.filter(c=>c.source).map(c=>[c.key,c.source]))};
};
