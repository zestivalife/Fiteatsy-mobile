import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { activityHomeState, RecoveryPanel, RecoveryTrend, scoreUnavailableLabel } from '../src/screens/home/HomeScreen';

jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn(),multiGet:jest.fn(),multiSet:jest.fn()}));
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>()=>{}),fetch:jest.fn()}));
jest.mock('../src/services/apiClient',()=>({apiFetch:jest.fn(),apiBaseUrl:'https://example.test'}));
jest.mock('expo-background-task',()=>({registerTaskAsync:jest.fn(),unregisterTaskAsync:jest.fn(),BackgroundTaskResult:{Success:'Success',Failed:'Failed'}}),{virtual:true});
jest.mock('expo-task-manager',()=>({defineTask:jest.fn(),isTaskDefined:jest.fn(()=>false),isTaskRegisteredAsync:jest.fn()}),{virtual:true});
jest.mock('../src/assets/fiteatsy-home/recovery-star.svg',()=>()=>null);
jest.mock('../src/assets/fiteatsy-home/progress-donut-chart.svg',()=>()=>null);

const Icon=()=>React.createElement(Text,null,'icon');
const metrics=[
  {key:'calm',label:'Calm',score:65,color:'#f00',position:'top',DefaultIcon:Icon,ActiveIcon:Icon},
  {key:'activity',label:'Activity',score:86,color:'#f60',position:'left',DefaultIcon:Icon,ActiveIcon:Icon},
  {key:'nourishment',label:'Nutrition',score:88,color:'#7f2',position:'right',DefaultIcon:Icon,ActiveIcon:Icon},
  {key:'mind',label:'Mind',score:67,color:'#73e',position:'bottomLeft',DefaultIcon:Icon,ActiveIcon:Icon},
  {key:'sleep',label:'Sleep',score:95,color:'#08f',position:'bottomRight',DefaultIcon:Icon,ActiveIcon:Icon}
] as any;

test('Star Orb component renders every selected candidate domain without changing its visual component',()=>{
  for(const item of [...metrics,{key:'healthIntelligence',label:'Recovery Core',score:86,color:'#D5062D'}]){
    const view=render(React.createElement(RecoveryPanel,{metrics,selectedMetric:item.key,selectedLabel:item.label,
      selectedScore:item.score,selectedColor:item.color,selectedState:{label:'Candidate validation'},onSelectMetric:()=>{}} as any));
    expect(view.getByText(`${item.score}/100`)).toBeTruthy();
    expect(view.getAllByText(item.label).length).toBeGreaterThan(0);
    view.unmount();
  }
});

test.each([0,1,50,100])('score ring distinguishes the valid score %s from missing data',(score)=>{
  const view=render(React.createElement(RecoveryPanel,{metrics,selectedMetric:'activity',selectedLabel:'Activity',
    selectedScore:score,selectedColor:'#f60',selectedState:{label:'Calculated'},onSelectMetric:()=>{}} as any));
  expect(view.getByTestId('recovery-score-track')).toBeTruthy();
  expect(view.getByTestId('recovery-score-progress')).toBeTruthy();
  expect(view.getByText(`${score}/100`)).toBeTruthy();
  view.unmount();
});

test('missing score keeps the neutral ring track without rendering fake zero progress',()=>{
  const view=render(React.createElement(RecoveryPanel,{metrics,selectedMetric:'sleep',selectedLabel:'Sleep',
    selectedScore:null,selectedColor:'#08f',selectedState:{label:'Methodology pending'},onSelectMetric:()=>{}} as any));
  expect(view.getByTestId('recovery-score-track')).toBeTruthy();
  expect(view.queryByTestId('recovery-score-progress')).toBeNull();
  expect(view.getByText('--/100')).toBeTruthy();
});

test('seven-day component renders seven distinct persisted candidate values and preserves null gaps',()=>{
  const values=[81,82,83,null,85,86,87].map((score,index)=>({dayKey:`2026-11-${String(11+index).padStart(2,'0')}`,dayLabel:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][index],score}));
  const view=render(React.createElement(RecoveryTrend,{values,hasData:true}));
  for(const score of [81,82,83,85,86,87])expect(view.getByText(`${score}%`)).toBeTruthy();
  expect(view.queryByText('84%')).toBeNull();
});

test('seven-day component explains methodology blocking instead of implying missing Health data',()=>{
  const values=[0,1,2,3,4,5,6].map(index=>({dayKey:`2026-11-${String(11+index).padStart(2,'0')}`,dayLabel:'Mon',score:null}));
  const view=render(React.createElement(RecoveryTrend,{values,hasData:false,unavailableLabel:'Methodology pending'}));
  expect(view.getByText('Methodology pending')).toBeTruthy();
  expect(view.queryByText('Waiting for data')).toBeNull();
});

test('pending score copy identifies actionable goals, history, methodology, and transport states',()=>{
  expect(scoreUnavailableLabel({status:'METHODOLOGY_PENDING',inputsMissing:['step_goal']})).toBe('Goal required');
  expect(scoreUnavailableLabel({status:'INSUFFICIENT_DATA',inputsMissing:['14_day_same_type_body_baseline']})).toBe('More history needed');
  expect(scoreUnavailableLabel({status:'METHODOLOGY_PENDING'})).toBe('Methodology pending');
  expect(scoreUnavailableLabel({status:'OFFLINE'})).toBe('Available offline');
  expect(scoreUnavailableLabel({status:'ERROR'})).toBe('Scoring unavailable');
});

test('Activity Home state distinguishes today data and measured partial scores without requiring goals',()=>{
  expect(activityHomeState({score:null,status:'INSUFFICIENT_DATA',inputsMissing:['step_goal'],hasCurrentDayMeasurement:false}))
    .toEqual({label:'No Activity data for today'});
  expect(activityHomeState({score:null,status:'INSUFFICIENT_DATA',inputsMissing:['step_goal'],hasCurrentDayMeasurement:true}))
    .toEqual({label:'Goal required'});
  expect(activityHomeState({score:64,status:'PARTIAL',componentCoverage:40,inputsMissing:['exercise_minutes'],hasCurrentDayMeasurement:true}))
    .toEqual({label:'Partial · 40% coverage'});
  expect(activityHomeState({score:82,status:'CALCULATED',componentCoverage:100,inputsMissing:[],hasCurrentDayMeasurement:true}))
    .toEqual({label:'Complete'});
});
