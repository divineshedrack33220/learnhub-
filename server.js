const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const validator = require('validator');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Password-based authentication middleware
const ADMIN_PASSWORD = 'admin123'; // Replace with a secure password in production
const authenticateAdmin = (req, res, next) => {
    const { password } = req.body;
    if (!password || password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password' });
    }
    next();
};

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://12:divine11@cluster0.rglgrrn.mongodb.net/learnhub?retryWrites=true&w=majority', {
    serverSelectionTimeoutMS: 30000,
    maxPoolSize: 10
}).then(() => {
    console.log('Connected to MongoDB Atlas');
    initializeData();
}).catch(err => {
    console.error('MongoDB Atlas connection error:', err);
    process.exit(1);
});

// Schemas
const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    level: { type: String, required: true, enum: ['Beginner', 'Intermediate', 'Advanced'] },
    image: { type: String, required: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    lectures: { type: Number, default: 0, min: 0 },
    isBestseller: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    group: { type: String, required: true, enum: ['technology', 'business', 'creative'] },
    courseCount: { type: Number, default: 0, min: 0 },
    popularity: { type: Number, default: 0, min: 0 },
    icon: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const contactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: String },
    reference: { type: String, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const visitorSchema = new mongoose.Schema({
    page: { type: String, required: true },
    visitedAt: { type: Date, default: Date.now }
});

const Course = mongoose.model('Course', courseSchema);
const Category = mongoose.model('Category', categorySchema);
const Contact = mongoose.model('Contact', contactSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Visitor = mongoose.model('Visitor', visitorSchema);

// Update courseCount for all categories
async function updateCourseCounts() {
    try {
        const categories = await Category.find().lean();
        for (const category of categories) {
            const count = await Course.countDocuments({ category: category._id });
            await Category.updateOne({ _id: category._id }, { courseCount: count, updatedAt: new Date() });
        }
        console.log('Updated course counts for categories');
    } catch (error) {
        console.error('Error updating course counts:', error);
    }
}

// Fix invalid category references
async function fixInvalidCourses(categories) {
    try {
        const invalidCourses = await Course.find({ category: { $not: { $type: 'objectId' } } }).lean();
        if (invalidCourses.length === 0) {
            console.log('No invalid courses found.');
            return;
        }

        console.log(`Found ${invalidCourses.length} courses with invalid category references. Attempting to fix...`);

        const categoryMapping = {
            'development': 'Web Development',
            'data-science': 'Artificial Intelligence',
            'marketing': 'Marketing',
            'design': 'Graphic Design',
            'business': 'Business',
            'finance': 'Finance'
        };

        const categoryMap = {};
        categories.forEach(cat => {
            categoryMap[cat.title] = cat._id;
        });

        for (const course of invalidCourses) {
            const oldCategory = course.category;
            const newCategoryTitle = categoryMapping[oldCategory];
            if (!newCategoryTitle) {
                console.warn(`No mapping found for category "${oldCategory}" in course "${course.title}". Skipping.`);
                continue;
            }
            const newCategoryId = categoryMap[newCategoryTitle];
            if (!newCategoryId) {
                console.warn(`Category "${newCategoryTitle}" not found for course "${course.title}". Skipping.`);
                continue;
            }
            await Course.updateOne(
                { _id: course._id },
                { $set: { category: newCategoryId, updatedAt: new Date() } }
            );
            console.log(`Fixed course "${course.title}": category "${oldCategory}" → "${newCategoryTitle}" (_id: ${newCategoryId})`);
        }

        console.log('Finished fixing invalid courses.');
        await updateCourseCounts();
    } catch (error) {
        console.error('Error fixing invalid courses:', error);
    }
}

// Initialize sample data
async function initializeData() {
    try {
        const categoryCount = await Category.countDocuments();
        let categories = [];
        if (categoryCount === 0) {
            console.log('Inserting sample categories...');
            categories = await Category.insertMany([
                { title: 'Web Development', description: 'Learn to build responsive websites.', group: 'technology', courseCount: 0, popularity: 1000, icon: 'fa-laptop-code', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Programming', description: 'Master various programming languages.', group: 'technology', courseCount: 0, popularity: 850, icon: 'fa-code', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Business', description: 'Grow your business skills.', group: 'business', courseCount: 0, popularity: 700, icon: 'fa-chart-line', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Entrepreneurship', description: 'Start and scale your business.', group: 'business', courseCount: 0, popularity: 500, icon: 'fa-briefcase', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Finance', description: 'Master financial planning and analysis.', group: 'business', courseCount: 0, popularity: 400, icon: 'fa-calculator', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Graphic Design', description: 'Create stunning visuals.', group: 'creative', courseCount: 0, popularity: 600, icon: 'fa-paint-brush', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Marketing', description: 'Learn digital and traditional marketing.', group: 'creative', courseCount: 0, popularity: 450, icon: 'fa-chart-pie', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Music', description: 'Master musical instruments and theory.', group: 'creative', courseCount: 0, popularity: 300, icon: 'fa-music', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Artificial Intelligence', description: 'Explore AI and machine learning.', group: 'technology', courseCount: 0, popularity: 350, icon: 'fa-robot', createdAt: new Date(), updatedAt: new Date() },
                { title: 'Photography', description: 'Learn professional photography techniques.', group: 'creative', courseCount: 0, popularity: 250, icon: 'fa-camera', createdAt: new Date(), updatedAt: new Date() }
            ]);
            console.log('Sample categories inserted successfully');
        } else {
            console.log('Categories already exist, fetching existing categories');
            categories = await Category.find().lean();
        }

        await fixInvalidCourses(categories);

        const courseCount = await Course.countDocuments();
        if (courseCount === 0) {
            console.log('Inserting sample courses...');
            const categoryMap = {};
            categories.forEach(cat => {
                categoryMap[cat.title] = cat._id;
            });

            const requiredCategories = ['Web Development', 'Marketing', 'Graphic Design', 'Business', 'Finance', 'Artificial Intelligence'];
            for (const catTitle of requiredCategories) {
                if (!categoryMap[catTitle]) {
                    console.error(`Category "${catTitle}" not found. Skipping course initialization.`);
                    return;
                }
            }

            await Course.insertMany([
                {
                    title: 'The Complete Web Development Bootcamp',
                    description: 'Master HTML, CSS, JavaScript, React, Node.js, MongoDB and more!',
                    category: categoryMap['Web Development'],
                    level: 'Beginner',
                    image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 4.8,
                    reviews: 1234,
                    lectures: 42,
                    isBestseller: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    title: 'Data Science & Machine Learning',
                    description: 'Python, TensorFlow, Pandas, NumPy, Matplotlib, and more',
                    category: categoryMap['Artificial Intelligence'],
                    level: 'Intermediate',
                    image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 4.5,
                    reviews: 987,
                    lectures: 36,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    title: 'The Complete Digital Marketing Course',
                    description: '12 Courses in 1: SEO, Google Ads, Facebook Ads, Email Marketing & more',
                    category: categoryMap['Marketing'],
                    level: 'Beginner',
                    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 5.0,
                    reviews: 2456,
                    lectures: 28,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    title: 'Graphic Design Masterclass',
                    description: 'Learn Photoshop, Illustrator, and InDesign to create stunning visuals',
                    category: categoryMap['Graphic Design'],
                    level: 'Intermediate',
                    image: 'https://images.unsplash.com/photo-1516321310762-6d0c29f75773?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 4.7,
                    reviews: 1789,
                    lectures: 35,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    title: 'Business Strategy Essentials',
                    description: 'Develop strategies to grow your business with practical insights',
                    category: categoryMap['Business'],
                    level: 'Advanced',
                    image: 'https://images.unsplash.com/photo-1516321310762-6d0c29f75773?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 4.9,
                    reviews: 3124,
                    lectures: 30,
                    isBestseller: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                {
                    title: 'Personal Finance 101',
                    description: 'Learn budgeting, investing, and financial planning basics',
                    category: categoryMap['Finance'],
                    level: 'Beginner',
                    image: 'https://images.unsplash.com/photo-1554224155-8a0f5b5c75e4?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
                    rating: 4.6,
                    reviews: 1456,
                    lectures: 25,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ]);
            console.log('Sample courses inserted successfully');
            await updateCourseCounts();
        } else {
            console.log('Courses already exist, skipping initialization');
        }
    } catch (error) {
        console.error('Error initializing data:', error);
    }
}

// Endpoints
// Health check
app.get('/api/health', async (req, res) => {
    try {
        await mongoose.connection.db.admin().ping();
        res.json({ status: 'ok', message: 'Server and MongoDB are running' });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ error: 'MongoDB connection failed' });
    }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password !== ADMIN_PASSWORD) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        res.json({ message: 'Login successful' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Course CRUD Endpoints ---

// Get all courses or filter by categoryId
app.get('/api/courses', async (req, res) => {
    try {
        const { categoryId } = req.query;
        let query = {};
        if (categoryId) {
            if (!mongoose.Types.ObjectId.isValid(categoryId)) {
                return res.status(400).json({ error: 'Invalid category ID' });
            }
            query.category = categoryId;
        }
        const courses = await Course.find(query).populate({
            path: 'category',
            select: 'title description group icon popularity courseCount'
        }).lean();
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// Get single course by ID
app.get('/api/courses/:id', async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }
        const course = await Course.findById(courseId).populate({
            path: 'category',
            select: 'title description group icon popularity courseCount'
        }).lean();
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(course);
    } catch (error) {
        console.error('Error fetching course:', error);
        res.status(500).json({ error: 'Failed to fetch course' });
    }
});

// Create a new course
app.post('/api/courses', authenticateAdmin, async (req, res) => {
    try {
        const { title, description, category, level, image, rating, reviews, lectures, isBestseller } = req.body;
        if (!title || !description || !category || !level || !image) {
            return res.status(400).json({ error: 'Title, description, category, level, and image are required' });
        }
        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        if (!['Beginner', 'Intermediate', 'Advanced'].includes(level)) {
            return res.status(400).json({ error: 'Invalid level' });
        }
        if (!validator.isURL(image)) {
            return res.status(400).json({ error: 'Invalid image URL' });
        }
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            return res.status(400).json({ error: 'Category not found' });
        }
        const sanitizedData = {
            title: validator.escape(title.trim()),
            description: validator.escape(description.trim()),
            category,
            level,
            image,
            rating: Math.max(0, Math.min(5, Number(rating) || 0)),
            reviews: Math.max(0, Number(reviews) || 0),
            lectures: Math.max(0, Number(lectures) || 0),
            isBestseller: Boolean(isBestseller),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const course = new Course(sanitizedData);
        await course.save();
        await updateCourseCounts();
        res.status(201).json({ message: 'Course created successfully', course });
    } catch (error) {
        console.error('Error creating course:', error);
        res.status(500).json({ error: 'Failed to create course' });
    }
});

// Update a course
app.put('/api/courses/:id', authenticateAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }
        const { title, description, category, level, image, rating, reviews, lectures, isBestseller } = req.body;
        if (!title || !description || !category || !level || !image) {
            return res.status(400).json({ error: 'Title, description, category, level, and image are required' });
        }
        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        if (!['Beginner', 'Intermediate', 'Advanced'].includes(level)) {
            return res.status(400).json({ error: 'Invalid level' });
        }
        if (!validator.isURL(image)) {
            return res.status(400).json({ error: 'Invalid image URL' });
        }
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            return res.status(400).json({ error: 'Category not found' });
        }
        const sanitizedData = {
            title: validator.escape(title.trim()),
            description: validator.escape(description.trim()),
            category,
            level,
            image,
            rating: Math.max(0, Math.min(5, Number(rating) || 0)),
            reviews: Math.max(0, Number(reviews) || 0),
            lectures: Math.max(0, Number(lectures) || 0),
            isBestseller: Boolean(isBestseller),
            updatedAt: new Date()
        };
        const course = await Course.findByIdAndUpdate(courseId, sanitizedData, { new: true, runValidators: true });
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        await updateCourseCounts();
        res.json({ message: 'Course updated successfully', course });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ error: 'Failed to update course' });
    }
});

// Delete a course
app.delete('/api/courses/:id', authenticateAdmin, async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }
        const course = await Course.findByIdAndDelete(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        await updateCourseCounts();
        res.json({ message: 'Course deleted successfully' });
    } catch (error) {
        console.error('Error deleting course:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// --- Category CRUD Endpoints ---

// Get all categories
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find().lean();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get single category by ID
app.get('/api/categories/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        const category = await Category.findById(categoryId).lean();
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'Failed to fetch category' });
    }
});

// Create a new category
app.post('/api/categories', authenticateAdmin, async (req, res) => {
    try {
        const { title, description, group, icon, popularity } = req.body;
        if (!title || !description || !group || !icon) {
            return res.status(400).json({ error: 'Title, description, group, and icon are required' });
        }
        if (!['technology', 'business', 'creative'].includes(group)) {
            return res.status(400).json({ error: 'Invalid group' });
        }
        const sanitizedData = {
            title: validator.escape(title.trim()),
            description: validator.escape(description.trim()),
            group,
            icon: validator.escape(icon.trim()),
            popularity: Math.max(0, Number(popularity) || 0),
            courseCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const category = new Category(sanitizedData);
        await category.save();
        res.status(201).json({ message: 'Category created successfully', category });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// Update a category
app.put('/api/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const categoryId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        const { title, description, group, icon, popularity } = req.body;
        if (!title || !description || !group || !icon) {
            return res.status(400).json({ error: 'Title, description, group, and icon are required' });
        }
        if (!['technology', 'business', 'creative'].includes(group)) {
            return res.status(400).json({ error: 'Invalid group' });
        }
        const sanitizedData = {
            title: validator.escape(title.trim()),
            description: validator.escape(description.trim()),
            group,
            icon: validator.escape(icon.trim()),
            popularity: Math.max(0, Number(popularity) || 0),
            updatedAt: new Date()
        };
        const category = await Category.findByIdAndUpdate(categoryId, sanitizedData, { new: true, runValidators: true });
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json({ message: 'Category updated successfully', category });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// Delete a category
app.delete('/api/categories/:id', authenticateAdmin, async (req, res) => {
    try {
        const categoryId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }
        const courseCount = await Course.countDocuments({ category: categoryId });
        if (courseCount > 0) {
            return res.status(400).json({ error: 'Cannot delete category with associated courses' });
        }
        const category = await Category.findByIdAndDelete(categoryId);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// Search courses and categories
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q ? validator.escape(req.query.q.toLowerCase()) : '';
        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }
        const filteredCourses = await Course.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        }).populate({
            path: 'category',
            select: 'title description group icon popularity courseCount'
        }).lean();
        const filteredCategories = await Category.find({
            $or: [
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        }).lean();
        res.json({ courses: filteredCourses, categories: filteredCategories });
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Failed to perform search' });
    }
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        const sanitizedData = {
            name: validator.escape(name.trim()),
            email: validator.normalizeEmail(email.trim()),
            subject: validator.escape(subject.trim()),
            message: validator.escape(message.trim()),
            createdAt: new Date()
        };
        const contact = new Contact(sanitizedData);
        await contact.save();
        res.status(201).json({ message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error saving contact submission:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get all contact messages (Admin only)
app.post('/api/messages', authenticateAdmin, async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 }).lean();
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// OPay payment endpoint
app.post('/api/pay', async (req, res) => {
    try {
        const { courseId, userPhone, bankCode } = req.body;
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }
        if (!userPhone || !validator.isMobilePhone(userPhone, 'any', { strictMode: true })) {
            return res.status(400).json({ error: 'Valid user phone number is required' });
        }
        if (!bankCode || !/^\d+$/.test(bankCode)) {
            return res.status(400).json({ error: 'Valid bank code is required' });
        }

        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // OPay payment initialization for BankUssd
        const paymentData = {
            amount: {
                currency: 'NGN',
                total: 4999 // Amount in kobo (49.99 NGN)
            },
            bankCode: bankCode,
            callbackUrl: 'http://localhost:3000/api/payment-callback',
            country: 'NG',
            customerName: 'LearnHub User',
            payMethod: 'BankUssd',
            product: {
                name: course.title,
                description: course.description
            },
            reference: `learnhub_${courseId}_${Date.now()}`,
            userPhone: userPhone
        };

        // Log request details for debugging
        console.log('OPay Request URL:', process.env.OPAY_API_URL);
        console.log('OPay Request Body:', JSON.stringify(paymentData, null, 2));

        const dataString = JSON.stringify(paymentData, null, 0);
        const signature = crypto.createHmac('sha512', process.env.OPAY_SECRET_KEY)
            .update(dataString)
            .digest('hex');

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${signature}`,
            'MerchantId': process.env.OPAY_MERCHANT_ID || '281825051198792' // Use env variable if available
        };

        console.log('OPay Request Headers:', headers);

        // Initialize payment with OPay
        const response = await axios.post(
            process.env.OPAY_API_URL,
            paymentData,
            { headers }
        );

        console.log('OPay Response:', response.data);

        if (response.data && response.data.code === '00000') {
            // Save payment record
            const payment = new Payment({
                courseId,
                userId: 'mock-user-id', // Replace with actual user ID if available
                reference: paymentData.reference,
                status: response.data.data.status.toLowerCase(),
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await payment.save();

            // Return USSD code to frontend
            res.status(200).json({
                message: 'Payment initialized successfully',
                ussdCode: response.data.data.nextAction?.ussd,
                reference: paymentData.reference
            });
        } else {
            throw new Error(response.data.message || 'Payment initialization failed');
        }
    } catch (error) {
        console.error('Error processing payment:', error);
        if (error.response) {
            console.error('OPay Response Data:', error.response.data);
            console.error('OPay Response Status:', error.response.status);
        }
        res.status(500).json({ error: 'Payment failed', details: error.response?.data?.message || error.message });
    }
});

// Payment callback endpoint
app.post('/api/payment-callback', async (req, res) => {
    try {
        const { reference, status } = req.body;
        if (!reference || !status) {
            return res.status(400).json({ error: 'Reference and status are required' });
        }

        // Verify payment status with OPay
        const dataString = JSON.stringify({ reference }, null, 0);
        const signature = crypto.createHmac('sha512', process.env.OPAY_SECRET_KEY)
            .update(dataString)
            .digest('hex');

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${signature}`,
            'MerchantId': process.env.OPAY_MERCHANT_ID || '281825051198792'
        };

        console.log('Callback Verification Headers:', headers);
        console.log('Callback Verification Body:', { reference });

        const verifyResponse = await axios.post(
            `${process.env.OPAY_API_URL}/transaction/status`,
            { reference },
            { headers }
        );

        console.log('OPay Verification Response:', verifyResponse.data);

        if (verifyResponse.data.code === '00000' && verifyResponse.data.data.status === 'SUCCESS') {
            await Payment.updateOne(
                { reference },
                { $set: { status: 'completed', updatedAt: new Date() } }
            );
            res.status(200).json({ message: 'Payment verified successfully' });
        } else {
            await Payment.updateOne(
                { reference },
                { $set: { status: verifyResponse.data.data.status.toLowerCase(), updatedAt: new Date() } }
            );
            res.status(400).json({ error: 'Payment verification failed', details: verifyResponse.data.message });
        }
    } catch (error) {
        console.error('Error in payment callback:', error);
        if (error.response) {
            console.error('OPay Response Data:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to process callback', details: error.response?.data?.message || error.message });
    }
});

// Generate course syllabus PDF
app.get('/api/courses/:id/syllabus', async (req, res) => {
    try {
        const courseId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: 'Invalid course ID' });
        }
        const course = await Course.findById(courseId).populate({
            path: 'category',
            select: 'title description group icon popularity courseCount'
        }).lean();
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${course.title.replace(/\s+/g, '_')}_Syllabus.pdf`);

        doc.pipe(res);
        doc.fontSize(20).text('LearnHub Course Syllabus', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text(`Course: ${course.title}`, { align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Description: ${course.description}`, { align: 'left' });
        doc.moveDown(0.5);
        doc.text(`Category: ${course.category ? course.category.title : 'Unknown'}`, { align: 'left' });
        doc.moveDown(0.5);
        doc.text(`Level: ${course.level}`, { align: 'left' });
        doc.moveDown(0.5);
        doc.text(`Lectures: ${course.lectures}`, { align: 'left' });
        doc.moveDown(0.5);
        doc.text(`Rating: ${course.rating} (${course.reviews} reviews)`, { align: 'left' });
        doc.moveDown();
        doc.text('This syllabus provides an overview of the course content. For detailed content, please access the course materials.', { align: 'left' });
        doc.end();
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate syllabus' });
    }
});

// Visitor tracking
app.post('/api/track-visit', async (req, res) => {
    try {
        const { page } = req.body;
        if (!page) {
            return res.status(400).json({ error: 'Page is required' });
        }
        const visitor = new Visitor({ page, visitedAt: new Date() });
        await visitor.save();
        res.status(201).json({ message: 'Visit tracked successfully' });
    } catch (error) {
        console.error('Error tracking visit:', error);
        res.status(500).json({ error: 'Failed to track visit' });
    }
});

app.get('/api/visitors', async (req, res) => {
    try {
        const count = await Visitor.countDocuments();
        res.json({ count });
    } catch (error) {
        console.error('Error fetching visitor count:', error);
        res.status(500).json({ error: 'Failed to fetch visitor count' });
    }
});

// Serve static files
app.use(express.static('public'));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});