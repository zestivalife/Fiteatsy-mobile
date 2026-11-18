import React,{useMemo,useState}from'react';
import{ActivityIndicator,Pressable,StyleSheet,Text,View}from'react-native';
import{NativeStackScreenProps}from'@react-navigation/native-stack';
import{Screen}from'../../components/Screen';
import{AppBackButton}from'../../components/AppBackButton';
import{RootStackParamList}from'../../navigation/types';
import{useAppContext}from'../../state/AppContext';
import{getThemeColors,radius,spacing,typography}from'../../design/tokens';
import{LIFESTYLE_HABIT_TYPES,LifestyleHabitType,recordLifestyleHabit}from'../../services/lifestyleHabitService';

type Props=NativeStackScreenProps<RootStackParamList,'LifestyleHabits'>;
const labels:Record<LifestyleHabitType,{title:string;copy:string}>={
  consistent_daily_routine:{title:'Consistent daily routine',copy:'I followed the routine I planned for today.'},
  recovery_rest_practice:{title:'Recovery or rest practice',copy:'I intentionally made time for recovery or rest.'},
  evening_screen_boundary:{title:'Evening screen boundary',copy:'I followed my planned evening screen boundary.'},
  outdoor_daylight_routine:{title:'Outdoor daylight routine',copy:'I completed my planned outdoor daylight routine.'}
};
const healthDay=()=>{const value=new Date();return`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;};

export const LifestyleHabitsScreen=({navigation}:Props)=>{const{authSession,onboarding,themeMode}=useAppContext();const p=getThemeColors(themeMode);
 const[values,setValues]=useState<Partial<Record<LifestyleHabitType,boolean>>>({});const[saving,setSaving]=useState(false);const[message,setMessage]=useState<string|null>(null);
 const complete=useMemo(()=>LIFESTYLE_HABIT_TYPES.every(type=>typeof values[type]==='boolean'),[values]);
 const save=async()=>{if(!authSession||!complete)return;setSaving(true);setMessage(null);try{const day=healthDay();const revision=Date.now();await Promise.all(LIFESTYLE_HABIT_TYPES.map((habitType,index)=>recordLifestyleHabit({userId:authSession.accountId,clientId:authSession.client.fiteatsyClientId,onboarding,healthDay:day,habitType,completed:values[habitType]!,revision:revision+index})));setMessage('Today’s lifestyle entries are saved and queued for secure sync.');}catch{setMessage('Your entries remain safely queued and will sync when the connection recovers.');}finally{setSaving(false);}};
 return <Screen scroll><AppBackButton onPress={()=>navigation.goBack()} label="Lifestyle"/><Text style={[styles.title,{color:p.textPrimary}]}>Daily lifestyle</Text><Text style={[styles.copy,{color:p.textSecondary}]}>Record only what actually happened today. Each item needs an explicit Yes or No.</Text>{LIFESTYLE_HABIT_TYPES.map(type=><View key={type} style={[styles.card,{backgroundColor:p.card,borderColor:p.stroke}]}><Text style={[styles.itemTitle,{color:p.textPrimary}]}>{labels[type].title}</Text><Text style={[styles.itemCopy,{color:p.textSecondary}]}>{labels[type].copy}</Text><View style={styles.row}>{([true,false]as const).map(value=><Pressable key={String(value)} accessibilityRole="button" accessibilityState={{selected:values[type]===value}} onPress={()=>setValues(current=>({...current,[type]:value}))} style={[styles.choice,{borderColor:values[type]===value?'#60AF00':p.stroke,backgroundColor:values[type]===value?'rgba(96,175,0,0.18)':p.card}]}><Text style={{color:p.textPrimary}}>{value?'Yes':'No'}</Text></Pressable>)}</View></View>)}{message?<Text accessibilityLiveRegion="polite" style={[styles.message,{color:p.textSecondary}]}>{message}</Text>:null}<Pressable accessibilityRole="button" disabled={!complete||saving} onPress={()=>void save()} style={[styles.save,(!complete||saving)&&styles.disabled]}>{saving?<ActivityIndicator color="#081100"/>:<Text style={styles.saveText}>Save today</Text>}</Pressable></Screen>};
const styles=StyleSheet.create({title:{...typography.h1,marginTop:spacing.md},copy:{...typography.body,marginBottom:spacing.lg},card:{borderWidth:1,borderRadius:radius.lg,padding:spacing.md,marginBottom:spacing.md},itemTitle:{...typography.h3},itemCopy:{...typography.body,marginTop:spacing.xs},row:{flexDirection:'row',gap:spacing.sm,marginTop:spacing.md},choice:{minHeight:44,minWidth:88,borderWidth:1,borderRadius:radius.pill,alignItems:'center',justifyContent:'center'},message:{...typography.body,marginVertical:spacing.md},save:{minHeight:52,borderRadius:radius.pill,backgroundColor:'#60AF00',alignItems:'center',justifyContent:'center',marginVertical:spacing.lg},disabled:{opacity:.45},saveText:{...typography.button,color:'#081100'}});
