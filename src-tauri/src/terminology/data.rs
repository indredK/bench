use super::types::{Industry, Term, TermCategory, TermSubcategory, TermWebsite};

const UNCLASSIFIED_SUBCATEGORY_ID: &str = "__unclassified__";

fn cat(id: &str, label: &str) -> TermCategory {
    TermCategory {
        id: id.into(),
        label: label.into(),
        subcategories: Vec::new(),
    }
}

fn subcat(id: &str, label: &str) -> TermSubcategory {
    TermSubcategory {
        id: id.into(),
        label: label.into(),
    }
}

fn web(url: &str, label: &str) -> TermWebsite {
    TermWebsite {
        url: url.into(),
        label: Some(label.into()),
    }
}

// Compact term constructors
// t!("id", "industry", "category", "title", "description")
macro_rules! t {
    ($id:literal, $ind:literal, $cat:literal, $title:literal, $desc:literal) => {
        Term {
            id: $id.into(),
            industry_id: $ind.into(),
            category_id: $cat.into(),
            subcategory_id: None,
            title: $title.into(),
            description: $desc.into(),
            websites: Vec::new(),
        }
    };
}
// ts!("id", "industry", "category", "subcategory", "title", "description")
macro_rules! ts {
    ($id:literal, $ind:literal, $cat:literal, $sub:literal, $title:literal, $desc:literal) => {
        Term {
            id: $id.into(),
            industry_id: $ind.into(),
            category_id: $cat.into(),
            subcategory_id: Some($sub.into()),
            title: $title.into(),
            description: $desc.into(),
            websites: Vec::new(),
        }
    };
}

pub fn builtin_industries() -> Vec<Industry> {
    vec![
        Industry {
            id: "computer".into(),
            label: "计算机".into(),
            categories: vec![
                TermCategory {
                    id: "frontend".into(),
                    label: "前端".into(),
                    subcategories: vec![
                        subcat("framework", "框架"),
                        subcat("styling", "样式"),
                        subcat("design", "设计"),
                        subcat("architecture", "架构"),
                        subcat("engineering", "工程化"),
                        subcat("performance", "性能"),
                        subcat("accessibility", "可访问性"),
                        subcat(UNCLASSIFIED_SUBCATEGORY_ID, "未分类"),
                    ],
                },
                cat("backend", "后端"),
                cat("network", "网络"),
                cat("database", "数据库"),
                cat("devops", "DevOps"),
                cat("security", "安全"),
                cat("architecture", "架构"),
                cat("os", "操作系统"),
                cat("compiler", "编译原理"),
                cat("distributed", "分布式"),
                cat("cloud", "云计算"),
                cat("testing", "测试"),
                cat("algorithm", "算法"),
                cat("mobile", "移动开发"),
            ],
        },
        Industry {
            id: "ai".into(),
            label: "人工智能".into(),
            categories: vec![
                cat("ml", "机器学习"),
                cat("llm", "大语言模型"),
                cat("cv", "计算机视觉"),
                cat("nlp", "自然语言处理"),
                cat("rl", "强化学习"),
            ],
        },
        Industry {
            id: "medicine".into(),
            label: "医疗".into(),
            categories: vec![
                cat("anatomy", "解剖"),
                cat("pharmacology", "药理"),
                cat("diagnosis", "诊断"),
                cat("surgery", "外科"),
                cat("imaging", "影像"),
            ],
        },
        Industry {
            id: "mechanics".into(),
            label: "机械".into(),
            categories: vec![
                cat("kinematics", "运动学"),
                cat("materials", "材料"),
                cat("manufacturing", "制造"),
                cat("hydraulics", "液压"),
                cat("thermodynamics", "热力学"),
            ],
        },
        Industry {
            id: "physics".into(),
            label: "物理".into(),
            categories: vec![
                cat("mechanics_phy", "经典力学"),
                cat("electromagnetism", "电磁学"),
                cat("quantum", "量子力学"),
                cat("thermodynamics_phy", "热力学"),
                cat("optics", "光学"),
            ],
        },
        Industry {
            id: "chemistry".into(),
            label: "化学".into(),
            categories: vec![
                cat("organic", "有机化学"),
                cat("inorganic", "无机化学"),
                cat("physical_chem", "物理化学"),
                cat("analytical", "分析化学"),
                cat("biochem", "生物化学"),
            ],
        },
        Industry {
            id: "biology".into(),
            label: "生物".into(),
            categories: vec![
                cat("cell", "细胞生物"),
                cat("genetics", "遗传学"),
                cat("ecology", "生态学"),
                cat("microbiology", "微生物"),
                cat("botany", "植物学"),
            ],
        },
        Industry {
            id: "finance".into(),
            label: "金融".into(),
            categories: vec![
                cat("investment", "投资"),
                cat("banking", "银行"),
                cat("insurance", "保险"),
                cat("accounting", "会计"),
                cat("derivatives", "衍生品"),
            ],
        },
        Industry {
            id: "law".into(),
            label: "法律".into(),
            categories: vec![
                cat("civil", "民法"),
                cat("criminal", "刑法"),
                cat("commercial", "商法"),
                cat("international", "国际法"),
                cat("ip", "知识产权"),
            ],
        },
        Industry {
            id: "economics".into(),
            label: "经济学".into(),
            categories: vec![
                cat("micro", "微观经济"),
                cat("macro", "宏观经济"),
                cat("international_eco", "国际贸易"),
                cat("behavioral", "行为经济"),
                cat("development", "发展经济"),
            ],
        },
        Industry {
            id: "architecture".into(),
            label: "建筑".into(),
            categories: vec![
                cat("structural", "结构"),
                cat("interior", "室内"),
                cat("urban", "城市规划"),
                cat("construction", "施工"),
                cat("landscape", "景观"),
            ],
        },
        Industry {
            id: "education".into(),
            label: "教育".into(),
            categories: vec![
                cat("pedagogy", "教学法"),
                cat("curriculum", "课程设计"),
                cat("psychology_edu", "教育心理"),
                cat("elearning", "在线教育"),
            ],
        },
        Industry {
            id: "psychology".into(),
            label: "心理学".into(),
            categories: vec![
                cat("clinical", "临床心理"),
                cat("cognitive", "认知心理"),
                cat("social_psy", "社会心理"),
                cat("developmental", "发展心理"),
                cat("abnormal", "异常心理"),
            ],
        },
        Industry {
            id: "marketing".into(),
            label: "市场营销".into(),
            categories: vec![
                cat("branding", "品牌"),
                cat("digital_mkt", "数字营销"),
                cat("consumer", "消费者行为"),
                cat("seo", "SEO/SEM"),
                cat("crm", "客户关系"),
            ],
        },
        Industry {
            id: "management".into(),
            label: "管理学".into(),
            categories: vec![
                cat("hr", "人力资源"),
                cat("strategy", "战略管理"),
                cat("operations", "运营管理"),
                cat("project", "项目管理"),
                cat("supply_chain", "供应链"),
            ],
        },
        Industry {
            id: "electric".into(),
            label: "电气".into(),
            categories: vec![
                cat("power", "电力系统"),
                cat("control", "控制系统"),
                cat("electronics", "电子"),
                cat("embedded", "嵌入式"),
                cat("signal", "信号处理"),
            ],
        },
        Industry {
            id: "energy".into(),
            label: "能源".into(),
            categories: vec![
                cat("renewable", "可再生能源"),
                cat("oil_gas", "石油天然气"),
                cat("nuclear", "核能"),
                cat("storage", "储能"),
                cat("grid", "电网"),
            ],
        },
        Industry {
            id: "environment".into(),
            label: "环境".into(),
            categories: vec![
                cat("pollution", "污染治理"),
                cat("ecology_env", "生态保护"),
                cat("climate", "气候变化"),
                cat("water", "水资源"),
                cat("waste", "废物处理"),
            ],
        },
        Industry {
            id: "food".into(),
            label: "食品".into(),
            categories: vec![
                cat("nutrition", "营养学"),
                cat("processing", "食品加工"),
                cat("safety", "食品安全"),
                cat("fermentation", "发酵"),
            ],
        },
        Industry {
            id: "agriculture".into(),
            label: "农业".into(),
            categories: vec![
                cat("planting", "种植业"),
                cat("livestock", "畜牧业"),
                cat("agritech", "农业科技"),
                cat("soil", "土壤科学"),
            ],
        },
        Industry {
            id: "transportation".into(),
            label: "交通运输".into(),
            categories: vec![
                cat("aviation", "航空"),
                cat("shipping", "航运"),
                cat("railway", "铁路"),
                cat("road", "公路"),
                cat("logistics", "物流"),
            ],
        },
        Industry {
            id: "materials".into(),
            label: "材料科学".into(),
            categories: vec![
                cat("metals", "金属材料"),
                cat("polymer", "高分子"),
                cat("composite", "复合材料"),
                cat("semiconductor", "半导体"),
                cat("nanomaterials", "纳米材料"),
            ],
        },
        Industry {
            id: "aerospace".into(),
            label: "航空航天".into(),
            categories: vec![
                cat("propulsion", "推进系统"),
                cat("astrodynamics", "轨道力学"),
                cat("avionics", "航电"),
                cat("structures", "结构"),
            ],
        },
        Industry {
            id: "philosophy".into(),
            label: "哲学".into(),
            categories: vec![
                cat("metaphysics", "形而上学"),
                cat("epistemology", "认识论"),
                cat("ethics", "伦理学"),
                cat("logic", "逻辑学"),
            ],
        },
        Industry {
            id: "sociology".into(),
            label: "社会学".into(),
            categories: vec![
                cat("social_structure", "社会结构"),
                cat("culture", "文化研究"),
                cat("demography", "人口学"),
                cat("criminology", "犯罪学"),
            ],
        },
        Industry {
            id: "media".into(),
            label: "传媒".into(),
            categories: vec![
                cat("journalism", "新闻"),
                cat("broadcasting", "广播电视"),
                cat("social_media", "社交媒体"),
                cat("pr", "公关"),
            ],
        },
        Industry {
            id: "art_design".into(),
            label: "艺术与设计".into(),
            categories: vec![
                cat("graphic", "平面设计"),
                cat("ux_ui", "UX/UI"),
                cat("film", "影视"),
                cat("music", "音乐"),
                cat("industrial_design", "工业设计"),
            ],
        },
        Industry {
            id: "statistics".into(),
            label: "统计学".into(),
            categories: vec![
                cat("probability", "概率论"),
                cat("inference", "推断统计"),
                cat("regression", "回归分析"),
                cat("bayesian", "贝叶斯统计"),
            ],
        },
        Industry {
            id: "mathematics".into(),
            label: "数学".into(),
            categories: vec![
                cat("algebra", "代数"),
                cat("calculus", "微积分"),
                cat("geometry", "几何"),
                cat("number_theory", "数论"),
                cat("topology", "拓扑学"),
            ],
        },
        Industry {
            id: "real_estate".into(),
            label: "房地产".into(),
            categories: vec![
                cat("valuation", "估价"),
                cat("development", "开发"),
                cat("property_mgt", "物业管理"),
                cat("financing", "融资"),
            ],
        },
    ]
}

pub fn builtin_terms() -> Vec<Term> {
    let mut v: Vec<Term> = Vec::new();
    // ─── 计算机 ───
    v.extend(include!("data/computer_frontend_framework.rs"));
    v.extend(include!("data/computer_frontend_styling.rs"));
    v.extend(include!("data/computer_frontend_design.rs"));
    v.extend(include!("data/computer_frontend_architecture.rs"));
    v.extend(include!("data/computer_frontend_engineering.rs"));
    v.extend(include!("data/computer_frontend_performance.rs"));
    v.extend(include!("data/computer_frontend_accessibility.rs"));
    v.extend(include!("data/computer_backend.rs"));
    v.extend(include!("data/computer_network.rs"));
    v.extend(include!("data/computer_database.rs"));
    v.extend(include!("data/computer_devops.rs"));
    v.extend(include!("data/computer_security.rs"));
    v.extend(include!("data/computer_architecture.rs"));
    v.extend(include!("data/computer_os.rs"));
    v.extend(include!("data/computer_compiler.rs"));
    v.extend(include!("data/computer_distributed.rs"));
    v.extend(include!("data/computer_cloud.rs"));
    v.extend(include!("data/computer_testing.rs"));
    v.extend(include!("data/computer_algorithm.rs"));
    v.extend(include!("data/computer_mobile.rs"));
    // ─── 人工智能 ───
    v.extend(include!("data/ai_ml.rs"));
    v.extend(include!("data/ai_llm.rs"));
    v.extend(include!("data/ai_cv.rs"));
    v.extend(include!("data/ai_nlp.rs"));
    v.extend(include!("data/ai_rl.rs"));
    // ─── 医疗 ───
    v.extend(include!("data/medicine_anatomy.rs"));
    v.extend(include!("data/medicine_pharmacology.rs"));
    v.extend(include!("data/medicine_diagnosis.rs"));
    v.extend(include!("data/medicine_surgery.rs"));
    v.extend(include!("data/medicine_imaging.rs"));
    // ─── 机械 ───
    v.extend(include!("data/mechanics_kinematics.rs"));
    v.extend(include!("data/mechanics_materials.rs"));
    v.extend(include!("data/mechanics_manufacturing.rs"));
    v.extend(include!("data/mechanics_hydraulics.rs"));
    v.extend(include!("data/mechanics_thermodynamics.rs"));
    // ─── 物理 ───
    v.extend(include!("data/physics_mechanics.rs"));
    v.extend(include!("data/physics_electromagnetism.rs"));
    v.extend(include!("data/physics_quantum.rs"));
    v.extend(include!("data/physics_thermodynamics.rs"));
    v.extend(include!("data/physics_optics.rs"));
    // ─── 化学 ───
    v.extend(include!("data/chemistry_organic.rs"));
    v.extend(include!("data/chemistry_inorganic.rs"));
    v.extend(include!("data/chemistry_physical.rs"));
    v.extend(include!("data/chemistry_analytical.rs"));
    v.extend(include!("data/chemistry_biochem.rs"));
    // ─── 生物 ───
    v.extend(include!("data/biology_cell.rs"));
    v.extend(include!("data/biology_genetics.rs"));
    v.extend(include!("data/biology_ecology.rs"));
    v.extend(include!("data/biology_microbiology.rs"));
    v.extend(include!("data/biology_botany.rs"));
    // ─── 金融 ───
    v.extend(include!("data/finance_investment.rs"));
    v.extend(include!("data/finance_banking.rs"));
    v.extend(include!("data/finance_insurance.rs"));
    v.extend(include!("data/finance_accounting.rs"));
    v.extend(include!("data/finance_derivatives.rs"));
    // ─── 法律 ───
    v.extend(include!("data/law_civil.rs"));
    v.extend(include!("data/law_criminal.rs"));
    v.extend(include!("data/law_commercial.rs"));
    v.extend(include!("data/law_international.rs"));
    v.extend(include!("data/law_ip.rs"));
    // ─── 经济学 ───
    v.extend(include!("data/economics_micro.rs"));
    v.extend(include!("data/economics_macro.rs"));
    v.extend(include!("data/economics_international.rs"));
    v.extend(include!("data/economics_behavioral.rs"));
    v.extend(include!("data/economics_development.rs"));
    // ─── 建筑 ───
    v.extend(include!("data/architecture_structural.rs"));
    v.extend(include!("data/architecture_interior.rs"));
    v.extend(include!("data/architecture_urban.rs"));
    v.extend(include!("data/architecture_construction.rs"));
    v.extend(include!("data/architecture_landscape.rs"));
    // ─── 教育 ───
    v.extend(include!("data/education_pedagogy.rs"));
    v.extend(include!("data/education_curriculum.rs"));
    v.extend(include!("data/education_psychology.rs"));
    v.extend(include!("data/education_elearning.rs"));
    // ─── 心理学 ───
    v.extend(include!("data/psychology_clinical.rs"));
    v.extend(include!("data/psychology_cognitive.rs"));
    v.extend(include!("data/psychology_social.rs"));
    v.extend(include!("data/psychology_developmental.rs"));
    v.extend(include!("data/psychology_abnormal.rs"));
    // ─── 市场营销 ───
    v.extend(include!("data/marketing_branding.rs"));
    v.extend(include!("data/marketing_digital.rs"));
    v.extend(include!("data/marketing_consumer.rs"));
    v.extend(include!("data/marketing_seo.rs"));
    v.extend(include!("data/marketing_crm.rs"));
    // ─── 管理学 ───
    v.extend(include!("data/management_hr.rs"));
    v.extend(include!("data/management_strategy.rs"));
    v.extend(include!("data/management_operations.rs"));
    v.extend(include!("data/management_project.rs"));
    v.extend(include!("data/management_supply_chain.rs"));
    // ─── 电气 ───
    v.extend(include!("data/electric_power.rs"));
    v.extend(include!("data/electric_control.rs"));
    v.extend(include!("data/electric_electronics.rs"));
    v.extend(include!("data/electric_embedded.rs"));
    v.extend(include!("data/electric_signal.rs"));
    // ─── 能源 ───
    v.extend(include!("data/energy_renewable.rs"));
    v.extend(include!("data/energy_oil_gas.rs"));
    v.extend(include!("data/energy_nuclear.rs"));
    v.extend(include!("data/energy_storage.rs"));
    v.extend(include!("data/energy_grid.rs"));
    // ─── 环境 ───
    v.extend(include!("data/environment_pollution.rs"));
    v.extend(include!("data/environment_ecology.rs"));
    v.extend(include!("data/environment_climate.rs"));
    v.extend(include!("data/environment_water.rs"));
    v.extend(include!("data/environment_waste.rs"));
    // ─── 食品 ───
    v.extend(include!("data/food_nutrition.rs"));
    v.extend(include!("data/food_processing.rs"));
    v.extend(include!("data/food_safety.rs"));
    v.extend(include!("data/food_fermentation.rs"));
    // ─── 农业 ───
    v.extend(include!("data/agriculture_planting.rs"));
    v.extend(include!("data/agriculture_livestock.rs"));
    v.extend(include!("data/agriculture_agritech.rs"));
    v.extend(include!("data/agriculture_soil.rs"));
    // ─── 交通运输 ───
    v.extend(include!("data/transportation_aviation.rs"));
    v.extend(include!("data/transportation_shipping.rs"));
    v.extend(include!("data/transportation_railway.rs"));
    v.extend(include!("data/transportation_road.rs"));
    v.extend(include!("data/transportation_logistics.rs"));
    // ─── 材料科学 ───
    v.extend(include!("data/materials_metals.rs"));
    v.extend(include!("data/materials_polymer.rs"));
    v.extend(include!("data/materials_composite.rs"));
    v.extend(include!("data/materials_semiconductor.rs"));
    v.extend(include!("data/materials_nanomaterials.rs"));
    // ─── 航空航天 ───
    v.extend(include!("data/aerospace_propulsion.rs"));
    v.extend(include!("data/aerospace_astrodynamics.rs"));
    v.extend(include!("data/aerospace_avionics.rs"));
    v.extend(include!("data/aerospace_structures.rs"));
    // ─── 哲学 ───
    v.extend(include!("data/philosophy_metaphysics.rs"));
    v.extend(include!("data/philosophy_epistemology.rs"));
    v.extend(include!("data/philosophy_ethics.rs"));
    v.extend(include!("data/philosophy_logic.rs"));
    // ─── 社会学 ───
    v.extend(include!("data/sociology_social_structure.rs"));
    v.extend(include!("data/sociology_culture.rs"));
    v.extend(include!("data/sociology_demography.rs"));
    v.extend(include!("data/sociology_criminology.rs"));
    // ─── 传媒 ───
    v.extend(include!("data/media_journalism.rs"));
    v.extend(include!("data/media_broadcasting.rs"));
    v.extend(include!("data/media_social_media.rs"));
    v.extend(include!("data/media_pr.rs"));
    // ─── 艺术与设计 ───
    v.extend(include!("data/art_design_graphic.rs"));
    v.extend(include!("data/art_design_ux_ui.rs"));
    v.extend(include!("data/art_design_film.rs"));
    v.extend(include!("data/art_design_music.rs"));
    v.extend(include!("data/art_design_industrial.rs"));
    // ─── 统计学 ───
    v.extend(include!("data/statistics_probability.rs"));
    v.extend(include!("data/statistics_inference.rs"));
    v.extend(include!("data/statistics_regression.rs"));
    v.extend(include!("data/statistics_bayesian.rs"));
    // ─── 数学 ───
    v.extend(include!("data/mathematics_algebra.rs"));
    v.extend(include!("data/mathematics_calculus.rs"));
    v.extend(include!("data/mathematics_geometry.rs"));
    v.extend(include!("data/mathematics_number_theory.rs"));
    v.extend(include!("data/mathematics_topology.rs"));
    // ─── 房地产 ───
    v.extend(include!("data/real_estate_valuation.rs"));
    v.extend(include!("data/real_estate_development.rs"));
    v.extend(include!("data/real_estate_property_mgt.rs"));
    v.extend(include!("data/real_estate_financing.rs"));
    v
}
