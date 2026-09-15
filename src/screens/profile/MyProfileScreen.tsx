import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { ProfileHeader, ProfileSection } from '../../components/ProfileUi';
import { getThemeColors, radius, spacing, typography } from '../../design/tokens';
import { RootStackParamList } from '../../navigation/types';
import { AssessmentGender } from '../../types';
import { useAppContext } from '../../state/AppContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MyProfile'>;
const genders: AssessmentGender[] = ['Male', 'Female', 'Prefer not to say'];
export const MyProfileScreen = ({ navigation }: Props) => {
  const { themeMode, onboarding, setOnboarding, authSession } = useAppContext(); const palette = getThemeColors(themeMode);
  const [name, setName] = useState(onboarding?.name ?? authSession?.user.name ?? '');
  const [dob, setDob] = useState(onboarding?.dateOfBirthISO?.slice(0, 10) ?? '');
  const [height, setHeight] = useState(onboarding?.heightCm?.toString() ?? ''); const [weight, setWeight] = useState(onboarding?.currentWeightKg?.toString() ?? '');
  const [gender, setGender] = useState<AssessmentGender | undefined>(onboarding?.gender); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);
  const inputStyle = [styles.input, { color: palette.textPrimary, borderColor: palette.stroke, backgroundColor: palette.cardMuted }];
  const save = () => { if (!onboarding || !name.trim()) return; setSaving(true); setOnboarding({ ...onboarding, name: name.trim(), dateOfBirthISO: dob || undefined, gender, heightCm: Number(height) || undefined, currentWeightKg: Number(weight) || undefined }); setSaved(true); setSaving(false); };
  return <Screen scroll><ProfileHeader navigation={navigation} title="My Profile" />
    <View style={styles.avatar}><Text style={[styles.initials, { color: palette.textPrimary }]}>{name.split(/\s+/).map(v => v[0]).join('').slice(0, 2).toUpperCase() || 'ME'}</Text></View>
    <Text style={[styles.photoNote, { color: palette.textMuted }]}>Profile photo upload will appear when secure media storage is available.</Text>
    <ProfileSection label="Personal details"><Field label="Full name"><TextInput accessibilityLabel="Full name" value={name} onChangeText={setName} style={inputStyle} /></Field><Field label="Date of birth (YYYY-MM-DD)"><TextInput accessibilityLabel="Date of birth" value={dob} onChangeText={setDob} style={inputStyle} /></Field><Field label="Gender"><View style={styles.chips}>{genders.map(item => <Pressable key={item} onPress={() => setGender(item)} style={[styles.chip, { borderColor: gender === item ? palette.blue : palette.stroke, backgroundColor: palette.cardMuted }]}><Text style={{ color: palette.textPrimary }}>{item}</Text></Pressable>)}</View></Field><View style={styles.two}><Field label="Height (cm)"><TextInput keyboardType="decimal-pad" value={height} onChangeText={setHeight} style={inputStyle} /></Field><Field label="Weight (kg)"><TextInput keyboardType="decimal-pad" value={weight} onChangeText={setWeight} style={inputStyle} /></Field></View></ProfileSection>
    <ProfileSection label="Verified contact"><ReadOnly label="Mobile number" value={authSession?.user.mobileNumber ?? 'Not available'} /><ReadOnly label="Email address" value={authSession?.user.email ?? 'Not available'} /></ProfileSection>
    {saved ? <Text accessibilityRole="alert" style={styles.success}>Profile saved on this device and queued for account sync.</Text> : null}<Pressable accessibilityRole="button" onPress={save} disabled={saving || !onboarding || !name.trim()} style={[styles.save, (!onboarding || !name.trim()) && styles.disabled]}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}</Pressable>
  </Screen>;
};
const Field=({label,children}:{label:string;children:React.ReactNode})=><View style={styles.field}><Text style={styles.label}>{label.toUpperCase()}</Text>{children}</View>;
const ReadOnly=({label,value}:{label:string;value:string})=><View style={styles.readonly}><View><Text style={styles.label}>{label.toUpperCase()}</Text><Text style={styles.readValue}>{value}</Text></View><Text style={styles.verified}>✓ Verified</Text></View>;
const styles=StyleSheet.create({avatar:{width:92,height:92,borderRadius:46,backgroundColor:'#29292D',borderWidth:2,borderColor:'#444',alignSelf:'center',alignItems:'center',justifyContent:'center'},initials:{...typography.title},photoNote:{...typography.caption,textAlign:'center',marginVertical:spacing.sm},field:{flex:1,gap:6,padding:spacing.md},label:{...typography.badge,color:'#8D8D94'},input:{minHeight:50,borderWidth:1,borderRadius:radius.sm,paddingHorizontal:spacing.sm,...typography.body},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{borderWidth:1,borderRadius:999,paddingHorizontal:12,paddingVertical:8},two:{flexDirection:'row'},readonly:{padding:spacing.md,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#333'},readValue:{...typography.bodyStrong,color:'#fff',marginTop:4},verified:{...typography.caption,color:'#2FD36B'},save:{minHeight:52,borderRadius:radius.sm,backgroundColor:'#1689F8',alignItems:'center',justifyContent:'center',marginBottom:30},saveText:{...typography.button,color:'#fff'},disabled:{opacity:.45},success:{...typography.caption,color:'#2FD36B',textAlign:'center',marginBottom:10}});
