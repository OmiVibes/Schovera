export type Role = 'teacher' | 'parent' | 'principal';
export type UpdateCategory =
  | 'academic'
  | 'attendance'
  | 'achievement'
  | 'behaviour'
  | 'homework_task'
  | 'general';
export type Importance = 'normal' | 'important';

export interface Profile {
  id: string;
  school_id: string;
  role: Role;
  full_name: string;
  email: string;
}

export interface Student {
  id: string;
  full_name: string;
  roll_number: string;
  class_id: string;
}

export interface StudentUpdate {
  id: string;
  student_id: string;
  teacher_id: string;
  category: UpdateCategory;
  title: string;
  message: string;
  importance: Importance;
  sent_at: string;
  teacher_name?: string;
  student_name?: string;
  acknowledged_at?: string | null;
}
