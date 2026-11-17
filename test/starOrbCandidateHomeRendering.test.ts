import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RecoveryPanel, RecoveryTrend } from '../src/screens/home/HomeScreen';

jest.mock('@react-native-async-storage/async-storage',()=>({getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn(),multiGet:jest.fn(),multiSet:jest.fn()}));
jest.mock('@react-native-community/netinfo',()=>({addEventListener:jest.fn(()=>()=>{}),fetch:jest.fn()}));
jest.mock('../src/services/apiClient',()=>({apiFetch:jest.fn(),apiBaseUrl:'https://example.test'}));
jest.mock('expo-secure-store',()=>({getItemAsync:jest.fn(),setItemAsync:jest.fn(),deleteItemAsync:jest.fn()}),{virtual:true});
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

test('seven-day component renders seven distinct persisted candidate values and preserves null gaps',()=>{
  const values=[81,82,83,null,85,86,87].map((score,index)=>({dayKey:`2026-11-${String(11+index).padStart(2,'0')}`,dayLabel:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][index],score}));
  const view=render(React.createElement(RecoveryTrend,{values,hasData:true}));
  for(const score of [81,82,83,85,86,87])expect(view.getByText(`${score}%`)).toBeTruthy();
  expect(view.queryByText('84%')).toBeNull();
});
