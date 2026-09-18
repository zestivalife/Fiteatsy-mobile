import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { ProfileRow, ProfileSection } from '../../components/ProfileUi';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import type { RootStackParamList } from '../../navigation/types';
import { useProfilePhoto } from '../../hooks/useProfilePhoto';
import { useAppContext } from '../../state/AppContext';
import { resolveClientName } from '../../utils/clientIdentity';

type Props=NativeStackScreenProps<RootStackParamList, 'Profile'>;

export const ProfileScreen=({navigation}:Props)=>{
  const {themeMode,authSession,onboarding,canonicalProfile}=useAppContext();
  const p=getThemeColors(themeMode);const name=resolveClientName(authSession?.user.name);
  const initials=name.split(/\s+/).map(v=>v[0]).join('').slice(0,2).toUpperCase();
  const completion=canonicalProfile ? canonicalProfile.nutrition.completionPercent : null;
  const photo=useProfilePhoto(authSession?.accountId??'');
  return <Screen scroll contentStyle={styles.screen}>
    <Text accessibilityRole="header" style={[styles.heading,{color:p.textPrimary}]}>Profile</Text>
    <View style={[styles.identity,{backgroundColor:p.card,borderColor:p.stroke}]}>
      <View style={styles.avatar}>{photo?<Image source={{uri:photo}} style={styles.avatarImage}/>:<Text style={styles.initials}>{initials}</Text>}</View>
      <View style={{flex:1}}><Text style={[styles.name,{color:p.textPrimary}]}>{name}</Text><Text numberOfLines={1} style={[styles.meta,{color:p.textMuted}]}>{authSession?.user.email}</Text><Text style={[styles.meta,{color:p.textMuted}]}>{authSession?.user.mobileNumber}</Text><View style={styles.member}><Text style={styles.memberText}>● Active member{completion!=null?` · ${completion}% profile`:''}</Text></View></View>
      <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('MyProfile')} style={styles.edit}><Text style={styles.editText}>Edit</Text></Pressable>
    </View>
    <ProfileSection label="Account"><ProfileRow icon="person-outline" color="#35B8D0" title="My Profile" subtitle="Personal details and health information" onPress={()=>navigation.navigate('MyProfile')}/><ProfileRow icon="restaurant-outline" color="#FF9F0A" title="Food Preferences" subtitle="Diet type, likes and restrictions" onPress={()=>navigation.navigate('FoodPreferences',{mode:'profile'})}/></ProfileSection>
    <ProfileSection label="Health connections">
      <ProfileRow icon="heart-outline" color="#FF375F" title="Connected Health" subtitle={onboarding?.wearablePreference==='sync'?'Health connection configured':'Manage health connection'} onPress={()=>navigation.navigate('ConnectedHealth')}/>
      {__DEV__ ? (
        <ProfileRow icon="bug-outline" color="#FF9F0A" title="Health Sync Debug" onPress={()=>navigation.navigate('HealthSyncDebug')}/>
      ) : null}
    </ProfileSection>
    <ProfileSection label="Membership"><ProfileRow icon="card-outline" color="#5E5CE6" title="Subscription" subtitle="Plan, entitlements and payment history" onPress={()=>navigation.navigate('MySubscription')}/></ProfileSection>
    <ProfileSection label="Preferences"><ProfileRow icon="notifications-outline" color="#FF6B35" title="Notifications" subtitle="Manage reminders" onPress={()=>navigation.navigate('NotificationPreferences')}/><ProfileRow icon="options-outline" color="#8E8E93" title="App Preferences" subtitle="Theme, language and units" onPress={()=>navigation.navigate('AppPreferences')}/></ProfileSection>
    <ProfileSection label="Privacy & security"><ProfileRow icon="shield-checkmark-outline" color="#30D158" title="Privacy & Consent" subtitle="Manage permissions" onPress={()=>navigation.navigate('PrivacyConsent')}/><ProfileRow icon="lock-closed-outline" color="#1689F8" title="Security" subtitle="Account and PIN security" onPress={()=>navigation.navigate('Security')}/></ProfileSection>
    <ProfileSection label="Support"><ProfileRow icon="help-circle-outline" color="#FFD60A" title="Help & Support" subtitle="Contact support and app information" onPress={()=>navigation.navigate('HelpSupport')}/></ProfileSection>
    <Text style={[styles.footer,{color:p.textMuted}]}>Your cached profile remains available during temporary network interruptions.</Text>
  </Screen>;
};

const styles=StyleSheet.create({screen:{paddingBottom:120},heading:{...typography.title,marginBottom:spacing.md},identity:{borderWidth:1,borderRadius:radius.md,padding:spacing.md,flexDirection:'row',alignItems:'center',gap:spacing.sm},avatar:{width:64,height:64,borderRadius:32,overflow:'hidden',backgroundColor:'#27282D',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FF375F'},avatarImage:{width:'100%',height:'100%'},initials:{...typography.bodyStrong,color:'#fff'},name:{...typography.bodyStrong},meta:{...typography.caption},member:{marginTop:6,borderRadius:999,backgroundColor:'rgba(47,211,107,.15)',paddingHorizontal:8,paddingVertical:4},memberText:{...typography.badge,color:'#2FD36B'},edit:{padding:10},editText:{...typography.caption,color:'#1689F8'},footer:{...typography.caption,textAlign:'center',marginVertical:spacing.lg}});
