import {calculateMindCompositeV1,calculateMindQuestionnaire,MIND_COMPOSITE_METHODOLOGY_VERSION} from '../packages/health-intelligence/src/mind-composite-v1';
const answers={emotionalFeeling:25,emotionalBalance:50,mentalEnergy:75,concentration:100} as const;
const source=(score:number)=>({score,status:'CALCULATED',healthDay:'2026-11-24',calculatedAt:'2026-11-24T12:00:00.000Z',methodologyVersion:'STAR_ORB_V1'});
describe('Mind Composite V1',()=>{
  it('uses equal questionnaire weights',()=>expect(calculateMindQuestionnaire(answers)).toBe(62.5));
  it('applies the approved composite formula',()=>{const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:source(80),sleep:source(60),activity:source(70),nutrition:source(90)}});expect(value.methodologyVersion).toBe(MIND_COMPOSITE_METHODOLOGY_VERSION);expect(value.score).toBe(70);expect(value.status).toBe('CALCULATED');expect(value.componentCoverage).toBe(100);});
  it('does not turn missing inputs into zero',()=>{const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:source(80)}});expect(value.score).toBe(67.27);expect(value.status).toBe('PARTIAL');expect(value.componentCoverage).toBe(55);expect(value.inputsMissing).toEqual(['sleep','activity','nutrition']);});
  it('rejects a source from another health day',()=>{const stale={...source(80),healthDay:'2026-11-23'};const value=calculateMindCompositeV1({answers,healthDay:'2026-11-24',sources:{calm:stale}});expect(value.score).toBe(62.5);expect(value.componentCoverage).toBe(40);});
});
