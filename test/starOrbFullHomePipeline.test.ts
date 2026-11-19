import React from 'react';
import {fireEvent,render} from '@testing-library/react-native';
import type {CandidateStarOrbValidation} from '../src/services/healthIntelligenceService';

const mockNavigate=jest.fn();
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({navigate:mockNavigate}),useFocusEffect:jest.fn()}));
jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn(),multiGet:jest.fn(),multiSet:jest.fn()}));
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>()=>{}),fetch:jest.fn()}));
jest.mock('../src/services/apiClient',()=>({apiFetch:jest.fn(),apiBaseUrl:'https://example.test'}));
jest.mock('expo-background-task',()=>({registerTaskAsync:jest.fn(),unregisterTaskAsync:jest.fn(),BackgroundTaskResult:{Success:'Success',Failed:'Failed'}}),{virtual:true});
jest.mock('expo-task-manager',()=>({defineTask:jest.fn(),isTaskDefined:jest.fn(()=>false),isTaskRegisteredAsync:jest.fn()}),{virtual:true});
jest.mock('../src/state/AppContext',()=>({useAppContext:()=>({authSession:null,getMedicationTimelineForDate:()=>[]})}));
jest.mock('../src/hooks/useProfilePhoto',()=>({useProfilePhoto:()=>null}));
jest.mock('../src/components/HomeHealthActions',()=>({HomeHealthActions:()=>null}));
jest.mock('../src/components/ConsultantAccessPrompt',()=>({ConsultantAccessPrompt:()=>null}));
jest.mock('../src/services/subscriptionService',()=>({getMySubscription:jest.fn()}));
jest.mock('../src/services/nutritionExperienceService',()=>({getNutritionExperience:jest.fn()}));
jest.mock('../src/services/assessmentService',()=>({getDraftAssessmentSession:jest.fn(),getLatestAssessmentResult:jest.fn()}));
jest.mock('../src/assets/fiteatsy-home/recovery-star.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/progress-donut-chart.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/activity-inactive.svg',()=>()=>null);jest.mock('../src/assets/fiteatsy-home/activity-selected.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/nutrition-inactive.svg',()=>()=>null);jest.mock('../src/assets/fiteatsy-home/nutrition-selected.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/mind-inactive.svg',()=>()=>null);jest.mock('../src/assets/fiteatsy-home/mind-selected.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/sleep-inactive.svg',()=>()=>null);jest.mock('../src/assets/fiteatsy-home/sleep-selected.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/calm-inactive.svg',()=>()=>null);jest.mock('../src/assets/fiteatsy-home/calm-selected.svg',()=>()=>null);

const score=(domain:string,healthDay:string,value:number)=>({domain,score:value,status:'CALCULATED' as const,methodologyId:'STAR_ORB_V1',methodologyVersion:'1.0.0',healthDay,calculatedAt:`${healthDay}T12:00:00.000Z`,confidence:'HIGH' as const,inputFreshness:'CURRENT',inputsUsed:['persisted'],inputsMissing:[],contributingFactors:['persisted'],explanation:'Persisted candidate evidence.',activation:'CANDIDATE_ONLY' as const,clinicalValidation:'PENDING' as const});
const days=Array.from({length:7},(_,index)=>{const healthDay=`2026-11-${String(12+index).padStart(2,'0')}`;return{healthDay,activity:score('activity',healthDay,70+index),sleep:score('sleep',healthDay,80+index),nourishment:score('nourishment',healthDay,60+index),calm:score('calm',healthDay,65+index),mind:score('mind',healthDay,67+index),recovery:score('recovery',healthDay,74+index),proposals:{everydayNourishment:{score:71,status:'PROPOSAL_ONLY' as const,version:'EVERYDAY_NOURISHMENT_V1_PROPOSAL'},selfReportedMindWellness:{score:72,status:'PROPOSAL_ONLY' as const,version:'SELF_REPORTED_MIND_WELLNESS_V1_PROPOSAL'}}};});
const response:CandidateStarOrbValidation={activation:'ISOLATED_VALIDATION_ONLY',methodologyVersion:'1.0.0',days,sourceCoverage:{lifestyle:{source:'health_events',status:'INTEGRATED'}}};

jest.mock('../src/services/canonicalHealthSyncCoordinator',()=>{
  const actual=jest.requireActual('../src/services/canonicalHealthSyncCoordinator');
  return{...actual,useCanonicalHealthSyncCoordinator:jest.fn()};
});

import {HomeScreen} from '../src/screens/home/HomeScreen';
import {candidateResponseToHomeSnapshot,useCanonicalHealthSyncCoordinator} from '../src/services/canonicalHealthSyncCoordinator';

test('authenticated candidate API projection reaches the complete Home Star Orb and seven-day chart without direct score props',()=>{
  (useCanonicalHealthSyncCoordinator as jest.Mock).mockReturnValue({candidateIntelligence:candidateResponseToHomeSnapshot(response),canonicalIntelligence:null,aggregates:[],lifecycle:{lastUploadedAtISO:null}});
  const view=render(React.createElement(HomeScreen));
  expect(view.getByTestId('star-orb-surface')).toBeTruthy();
  expect(view.getByText('80/100')).toBeTruthy();
  for(const value of [74,75,76,77,78,79,80])expect(view.getByText(`${value}%`)).toBeTruthy();
  for(const label of ['Calm','Activity','Nutrition','Mind','Sleep'])expect(view.getAllByText(label).length).toBeGreaterThan(0);
});

test.each([81,0])('candidate Activity %s overrides stale canonical methodology state without losing zero',value=>{
  const candidate={...response,days:response.days.map((day,index)=>index===response.days.length-1
    ?{...day,activity:score('activity',day.healthDay,value)}:day)};
  const pending={scores:{
    activity:{score:null,status:'METHODOLOGY_PENDING'},sleep:{score:null,status:'METHODOLOGY_PENDING'},
    nutrition:{score:null,status:'METHODOLOGY_PENDING'},calm:{score:null,status:'METHODOLOGY_PENDING'},
    mind:{score:null,status:'METHODOLOGY_PENDING'},recovery:{score:null,status:'METHODOLOGY_PENDING'}
  }};
  (useCanonicalHealthSyncCoordinator as jest.Mock).mockReturnValue({candidateIntelligence:candidateResponseToHomeSnapshot(candidate),canonicalIntelligence:pending,aggregates:[],lifecycle:{lastUploadedAtISO:null}});
  const view=render(React.createElement(HomeScreen));
  fireEvent.press(view.getAllByText('Activity')[0]);
  expect(view.getByText(`${value}/100`)).toBeTruthy();
  expect(view.queryByText('--/100')).toBeNull();
});
