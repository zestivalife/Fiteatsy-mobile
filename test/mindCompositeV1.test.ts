import {calculateMindCompositeV1,calculateMindQuestionnaire,MIND_COMPOSITE_METHODOLOGY_VERSION} from '../packages/health-intelligence/src/mind-composite-v1';
import {STAR_ORB_METHODOLOGY_VERSION} from '../packages/health-intelligence/src/methodology-v1';
import {MIND_CHECK_IN_QUESTIONS} from '../src/components/mindCheckInQuestions';
import fs from 'node:fs';
const answers={emotionalFeeling:25,emotionalBalance:50,mentalEnergy:75,concentration:100} as const;
const source=(score:number)=>({score,status:'CALCULATED',healthDay:'2026-11-24',calculatedAt:'2026-11-24T12:00:00.000Z',methodologyVersion:STAR_ORB_METHODOLOGY_VERSION,inputFreshness:'CURRENT'});
describe('Mind Composite V1',()=>{
  it('uses question-specific labels without changing the five numerical values',()=>{
    expect(MIND_CHECK_IN_QUESTIONS.map(([,question,options])=>({question,options}))).toEqual([
      {question:'How have you been feeling emotionally today?',options:[[0,'Very low'],[25,'Low'],[50,'Neutral'],[75,'Good'],[100,'Very good']]},
      {question:'How emotionally balanced have you felt today?',options:[[0,'Very unsettled'],[25,'Unsettled'],[50,'Mixed'],[75,'Mostly balanced'],[100,'Very balanced']]},
      {question:'How mentally energetic have you felt today?',options:[[0,'Exhausted'],[25,'Tired'],[50,'Average'],[75,'Energetic'],[100,'Very energetic']]},
      {question:'How well have you been able to concentrate today?',options:[[0,'Very difficult'],[25,'Difficult'],[50,'Average'],[75,'Easy'],[100,'Very easy']]}
    ]);
  });
  it('uses equal questionnaire weights',()=>expect(calculateMindQuestionnaire(answers)).toBe(62.5));
  it('applies the approved composite formula',()=>{const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:source(80),sleep:source(60),activity:source(70),nutrition:source(90)}});expect(value.methodologyVersion).toBe(MIND_COMPOSITE_METHODOLOGY_VERSION);expect(value.score).toBe(70);expect(value.status).toBe('CALCULATED');expect(value.componentCoverage).toBe(100);});
  it('does not turn missing inputs into zero',()=>{const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:source(80)}});expect(value.score).toBe(67.27);expect(value.status).toBe('PARTIAL');expect(value.componentCoverage).toBe(55);expect(value.inputsMissing).toEqual(['sleep','activity','nutrition']);});
  it('rejects a source from another health day',()=>{const stale={...source(80),healthDay:'2026-11-23'};const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:stale}});expect(value.score).toBe(62.5);expect(value.componentCoverage).toBe(40);});
  it.each([
    ['stale source',{inputFreshness:'STALE'}],
    ['invalid timestamp',{calculatedAt:'not-a-date'}],
    ['missing freshness metadata',{inputFreshness:undefined}],
    ['incompatible methodology',{methodologyVersion:'INCOMPATIBLE'}]
  ])('excludes a %s while preserving its provenance',(_label,override)=>{const rejected={...source(80),...override};const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:rejected}});expect(value.score).toBe(62.5);expect(value.componentCoverage).toBe(40);expect(value.inputsMissing).toContain('calm');expect(value.sourceComponents.calm).toEqual(rejected);});
  it('reports stale and unknown freshness from the supplied evidence',()=>{
    expect(calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:{...source(80),inputFreshness:'STALE'}}}).inputFreshness).toBe('STALE');
    expect(calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:{...source(80),inputFreshness:undefined}}}).inputFreshness).toBe('UNKNOWN');
  });
  it('preserves source freshness and recalculates an existing check-in after source score updates',()=>{
    const service=fs.readFileSync('backend/src/modules/intelligence/mind-composite.service.ts','utf8');
    const starOrb=fs.readFileSync('backend/src/modules/intelligence/star-orb-candidate.service.ts','utf8');
    expect(service).toContain('inputFreshness:value.inputFreshness');
    expect(service).toContain('inputFreshness:storedFreshness(row)');
    expect(starOrb).toContain('await recalculateMindCompositeIfPresent(');
  });
});
