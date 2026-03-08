import { createClient } from '@supabase/supabase-js';


// Initialize database client
const supabaseUrl = 'https://olasjxzgnuzedhlaluwu.databasepad.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjM4OWQxZTA3LWM1ODUtNDhhNy1hMmQ5LTkwZWMzNTdmZTYwYiJ9.eyJwcm9qZWN0SWQiOiJvbGFzanh6Z251emVkaGxhbHV3dSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzcyMDg4NTg4LCJleHAiOjIwODc0NDg1ODgsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.2ACcqjD9C9jQEbOzETU5yW5icQ-QaK1axUw2F7oPOJU';
const supabase = createClient(supabaseUrl, supabaseKey);


export { supabase };