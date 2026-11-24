export interface CourseReview {
  id: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface ReviewModerationResult extends CourseReview {
  visible: boolean;
  moderationReason: string | null;
}

export interface AdminCourseReview extends ReviewModerationResult {
  courseId: string;
  courseTitle: string;
}

export interface CourseReviewStats {
  rating: number;
  reviewCount: number;
}
