const { PrismaClient } = require("@prisma/client");
const { response } = require("express");
const prisma = new PrismaClient();

exports.getAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany();
    res.status(200).json(courses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.getCourses = async (req, res) => {
  try {
    const randomCourses = await prisma.$queryRawUnsafe(`
      SELECT title, thumbnail_pic_link, course_type, course_id 
      FROM "Course"`);

    console.log(randomCourses);
    res.status(200).json(randomCourses);
  } catch (error) {
    console.error('Error fetching random courses:', error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getCourseDetails = async (req, res) => {
  const { course_id } = req.params;

  try {
    const courseDetails = await prisma.course.findUnique({
      where: {
        course_id: parseInt(course_id),
      },
      select: {
        title: true,
        description: true,
        thumbnail_pic_link: true,
        Enrollment_Counts: true,
        certificate_preview_link: true,
        course_type: true,
        price: true,
        points_providing: true,
        Rate: true,
        number_of_people_rated: true,
        course_level: true
        // course_level: true,
        // number_of_ratings: true,
      }
    });

    if (!courseDetails) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.status(200).json(courseDetails);
  } catch (error) {
    console.error('Error fetching course details:', error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
const NodeCache = require("node-cache");
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Cache TTL: 1 hour, check every 10 minutes

exports.check = async (req, res) => {
  const { userId, page = 1, limit = 10 } = req.body; // Extract page and limit with defaults
  const offset = (page - 1) * limit; // Calculate the offset for pagination

  // Cache key includes pagination parameters for uniqueness
  const cacheKey = userId
    ? `courses:${userId}:page:${page}:limit:${limit}`
    : `all_courses:page:${page}:limit:${limit}`;

  // Check cache for the requested data
  const cachedData = myCache.get(cacheKey);
  if (cachedData) {
    console.log('Cache hit:', cacheKey);
    return res.status(200).json(cachedData);
  }

  try {
    if (!userId) {
      // Fetch paginated courses without user-specific data
      const all_courses = await prisma.course.findMany({
        skip: offset,
        take: limit,
      });

      // Cache and respond
      myCache.set(cacheKey, all_courses);
      return res.status(200).json(all_courses);
    } else {
      // Fetch courses with user-specific data (e.g., progress)
      const coursesWithUserData = await prisma.course.findMany({
        skip: offset,
        take: limit,
        include: {
          course_progress: {
            where: {
              userId: userId,
            },
            select: {
              completed_course: true,
              completed: true,
            },
          },
        },
      });

      // Process and map user-specific data
      const courses = coursesWithUserData.map((course) => {
        const userProgress = course.course_progress[0]; // Assuming at most one entry per user per course
        return {
          ...course,
          purchased: !!userProgress, // If userProgress exists, mark as purchased
          completed_course: userProgress ? userProgress.completed_course : 0,
          completed: userProgress ? userProgress.completed : false,
        };
      });

      // Cache and respond
      myCache.set(cacheKey, courses);
      return res.status(200).json(courses);
    }
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

exports.gettrendingCourses = async (req, res) => {
  const userId = req.body.userId; // Assuming userId is sent in the request body
  if (userId == null) {
    const trendingCourses = await prisma.course.findMany({
      orderBy: {
        Enrollment_Counts: 'desc', // Example: order by number of enrollments
      },
      take:5
    });
    return res.status(200).json(trendingCourses)
  } else {
    try {
      // Fetch trending courses ordered by Enrollment_Counts
      const courses = await prisma.course.findMany({
        orderBy: {
          Enrollment_Counts: 'desc', // Example: order by number of enrollments
        },
        take:5
      });

      // Fetch user progress for all courses at once
      const userProgress = await prisma.userCourseProgress.findMany({
        where: {
          userId: userId,
          courseId: {
            in: courses.map(course => course.course_id), // Get course IDs from the trending courses
          },
        },
      });

      // Create a mapping of course progress for the user
      const progressMap = {};
      userProgress.forEach(progress => {
        progressMap[progress.courseId] = progress;
      });

      // Construct the response data
      const responseData = courses.map(course => {
        const progress = progressMap[course.course_id] || null; // Get user progress if exists

        return {
          course_id: course.course_id,
          title: course.title,
          thumbnail_pic_link: course.thumbnail_pic_link,
          completed_course: progress ? progress.completed_course : 0, // Progress percentage
          completed: progress ? progress.completed : false, // Purchase status
          purchased: !!progress, // Check if the user has purchased the course
        };
      });
      // console.log(responseData)
      res.json(responseData);
    } catch (error) {
      console.error('Error fetching trending courses:', error);
      res.status(500).json({ error: 'Failed to fetch trending courses' });
    }
  }
}