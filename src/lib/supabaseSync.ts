import { supabase, isSupabaseActive } from './supabaseClient';

export interface Profile {
  name: string;
  color: string;
  theme?: string;
}

export interface BookmarkedItem {
  title: string;
  slug: string;
  img: string;
  type: 'anime' | 'donghua' | 'drama';
  url: string;
  ep?: string;
}

// 1. Get or Create Device ID (UUID)
export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('aylin_device_id');
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = 'dev-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    localStorage.setItem('aylin_device_id', id);
  }
  return id;
};

// 2. Fetch Profiles from Supabase
export const fetchProfilesFromCloud = async (deviceId: string): Promise<Profile[]> => {
  if (!isSupabaseActive() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('name, color, theme')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch profiles from cloud:', err);
    return [];
  }
};

// 3. Save Profile to Cloud
export const saveProfileToCloud = async (deviceId: string, name: string, color: string, theme = 'theme-neon-purple'): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({
        device_id: deviceId,
        name,
        color,
        theme
      }, { onConflict: 'device_id,name' });

    if (error) throw error;
  } catch (err) {
    console.error('Failed to save profile to cloud:', err);
  }
};

// 4. Delete Profile and its data from Cloud
export const deleteProfileFromCloud = async (deviceId: string, name: string): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    // Delete profile
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('device_id', deviceId)
      .eq('name', name);

    if (profileError) throw profileError;

    // Delete associated bookmarks
    await supabase
      .from('bookmarks')
      .delete()
      .eq('device_id', deviceId)
      .eq('profile_name', name);

    // Delete associated history
    await supabase
      .from('history')
      .delete()
      .eq('device_id', deviceId)
      .eq('profile_name', name);

  } catch (err) {
    console.error('Failed to delete profile from cloud:', err);
  }
};

// 5. Update Profile Theme in Cloud
export const updateProfileThemeInCloud = async (deviceId: string, name: string, theme: string): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ theme })
      .eq('device_id', deviceId)
      .eq('name', name);

    if (error) throw error;
  } catch (err) {
    console.error('Failed to update profile theme in cloud:', err);
  }
};

// 6. Fetch Bookmarks from Cloud
export const fetchBookmarksFromCloud = async (deviceId: string, profileName: string): Promise<BookmarkedItem[]> => {
  if (!isSupabaseActive() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('title, slug, img, type, url')
      .eq('device_id', deviceId)
      .eq('profile_name', profileName)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Failed to fetch bookmarks from cloud:', err);
    return [];
  }
};

// 7. Add Bookmark to Cloud
export const addBookmarkToCloud = async (
  deviceId: string,
  profileName: string,
  item: BookmarkedItem
): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    const { error } = await supabase
      .from('bookmarks')
      .upsert({
        device_id: deviceId,
        profile_name: profileName,
        slug: item.slug,
        title: item.title,
        img: item.img,
        type: item.type,
        url: typeof window !== 'undefined' ? window.location.href : ''
      }, { onConflict: 'device_id,profile_name,slug' });

    if (error) throw error;
  } catch (err) {
    console.error('Failed to add bookmark to cloud:', err);
  }
};

// 8. Remove Bookmark from Cloud
export const removeBookmarkFromCloud = async (deviceId: string, profileName: string, slug: string): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('device_id', deviceId)
      .eq('profile_name', profileName)
      .eq('slug', slug);

    if (error) throw error;
  } catch (err) {
    console.error('Failed to remove bookmark from cloud:', err);
  }
};

// 9. Fetch History (Watched Episodes) from Cloud
export const fetchHistoryFromCloud = async (
  deviceId: string,
  profileName: string,
  animeSlug: string
): Promise<string[]> => {
  if (!isSupabaseActive() || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('history')
      .select('episode_slug')
      .eq('device_id', deviceId)
      .eq('profile_name', profileName)
      .eq('anime_slug', animeSlug);

    if (error) throw error;
    return (data || []).map((h) => h.episode_slug);
  } catch (err) {
    console.error('Failed to fetch history from cloud:', err);
    return [];
  }
};

// 10. Add History Entry to Cloud
export const addHistoryToCloud = async (
  deviceId: string,
  profileName: string,
  animeSlug: string,
  episodeSlug: string
): Promise<void> => {
  if (!isSupabaseActive() || !supabase) return;
  try {
    const { error } = await supabase
      .from('history')
      .upsert({
        device_id: deviceId,
        profile_name: profileName,
        anime_slug: animeSlug,
        episode_slug: episodeSlug
      }, { onConflict: 'device_id,profile_name,episode_slug' });

    if (error) throw error;
  } catch (err) {
    console.error('Failed to save history entry to cloud:', err);
  }
};
